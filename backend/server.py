from __future__ import annotations

import hashlib
import heapq
import json
import math
import os
import re
import secrets
import sqlite3
import time
import urllib.parse
import zipfile
from collections import Counter, deque
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from xml.etree import ElementTree as ET


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = PROJECT_ROOT / "backend" / "data"
DB_PATH = DATA_DIR / "library.db"
FRONTEND_DIR = PROJECT_ROOT / "frontend" / "static"
BOOK_DOCX = DATA_DIR / "book_collection_filled_1500.docx"

TOKENS: dict[str, int] = {}
GRID_SIZE = 30
ENTRANCE = (0, 0)
CELL_EMPTY = 0
CELL_SHELF = 1
CELL_ENTRANCE = 2
CELL_CROWDED = 4
CELL_READING = 5

SHELF_GROUPS = [
    (range(2, 8), [2, 3, 6, 7, 10, 11, 14, 15, 18, 19, 22, 23, 26, 27]),
    (range(10, 20), [2, 3, 6, 7, 22, 23, 26, 27]),
    (range(22, 28), [2, 3, 6, 7, 10, 11, 14, 15, 18, 19, 22, 23]),
    (range(22, 28), [26, 27]),
]
CROWDED_ROWS = range(9, 21)
CROWDED_COLS = range(9, 21)
READING_AREAS = [
    (range(10, 12), range(10, 14)),
    (range(10, 12), range(16, 20)),
    (range(14, 16), range(10, 14)),
    (range(14, 16), range(16, 20)),
    (range(18, 20), range(10, 14)),
    (range(18, 20), range(16, 20)),
]
DEFAULT_SEAT = (10, 10)


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def now() -> str:
    return time.strftime("%Y-%m-%d %H:%M:%S")


def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode("utf-8")).hexdigest()


def parse_docx_table(path: Path) -> list[dict[str, str]]:
    ns = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
    with zipfile.ZipFile(path) as docx:
        xml = docx.read("word/document.xml")
    root = ET.fromstring(xml)
    rows: list[list[str]] = []
    for tr in root.findall(".//w:tbl/w:tr", ns):
        values: list[str] = []
        for tc in tr.findall("./w:tc", ns):
            text = "".join(t.text or "" for t in tc.findall(".//w:t", ns)).strip()
            values.append(text)
        if values:
            rows.append(values)
    if not rows:
        return []
    header = rows[0]
    records = []
    for row in rows[1:]:
        if len(row) < len(header):
            row += [""] * (len(header) - len(row))
        records.append(dict(zip(header, row)))
    return records


def generate_shelves() -> list[tuple[str, int, int, str]]:
    positions = []
    seen = set()
    for rows, cols in SHELF_GROUPS:
        for row in rows:
            for col in cols:
                if (row, col) not in seen:
                    positions.append((row, col))
                    seen.add((row, col))
    return [(f"S{idx:03d}", row, col, "shelf") for idx, (row, col) in enumerate(positions, start=1)]


def shelf_id_for_book(index: int) -> str:
    shelf_count = len(generate_shelves())
    return f"S{((index - 1) % shelf_count) + 1:03d}"


def reading_seats() -> list[tuple[int, int]]:
    seats = []
    for rows, cols in READING_AREAS:
        for row in rows:
            for col in cols:
                seats.append((row, col))
    return seats


def assign_books_to_shelves(records: list[dict[str, str]]) -> list[dict[str, Any]]:
    grouped: dict[str, list[dict[str, str]]] = {}
    order: list[str] = []
    for record in records:
        category = record.get("标签", "").strip() or "未分类"
        if category not in grouped:
            grouped[category] = []
            order.append(category)
        grouped[category].append(record)

    pure: list[tuple[str, dict[str, str]]] = []
    remainder: list[tuple[str, dict[str, str]]] = []
    for category in order:
        books = grouped[category]
        pure_count = (len(books) // 5) * 5
        pure.extend((category, book) for book in books[:pure_count])
        remainder.extend((category, book) for book in books[pure_count:])

    ordered = pure + remainder
    assigned = []
    for index, (category, record) in enumerate(ordered, start=1):
        assigned.append(
            {
                "book_id": f"B{index:04d}",
                "source_index": record.get("序号", str(index)),
                "title": record.get("书名", f"Book {index}"),
                "author": record.get("作者", "Unknown"),
                "pages": record.get("页数（可选）", ""),
                "description": record.get("简介（可选）", ""),
                "category": category,
                "shelf_id": shelf_id_for_book(index),
                "shelf_slot": ((index - 1) // len(generate_shelves())) + 1,
                "status": "available",
            }
        )
    return assigned


def fallback_books() -> list[dict[str, Any]]:
    categories = ["文学", "奇幻", "历史", "青春", "言情", "推理", "传记", "科幻", "恐怖", "悬疑"]
    books = []
    for i in range(1, 151):
        cat = categories[(i - 1) % len(categories)]
        books.append(
            {
                "book_id": f"B{i:04d}",
                "source_index": str(i),
                "title": f"{cat}示例图书 {i}",
                "author": "Sample Author",
                "pages": "300",
                "description": f"一本用于演示{cat}分类搜索和推荐的图书。",
                "category": cat,
                "shelf_id": shelf_id_for_book(i),
                "shelf_slot": ((i - 1) // len(generate_shelves())) + 1,
                "status": "available",
            }
        )
    return books


def init_db() -> None:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with connect() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                created_at TEXT NOT NULL,
                last_login_at TEXT
            );
            CREATE TABLE IF NOT EXISTS shelves (
                id TEXT PRIMARY KEY,
                row INTEGER NOT NULL,
                col INTEGER NOT NULL,
                pattern TEXT NOT NULL,
                capacity INTEGER NOT NULL DEFAULT 5,
                category_zone TEXT
            );
            CREATE TABLE IF NOT EXISTS books (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                book_id TEXT UNIQUE NOT NULL,
                source_index TEXT,
                title TEXT NOT NULL,
                author TEXT,
                pages TEXT,
                description TEXT,
                category TEXT,
                shelf_id TEXT NOT NULL,
                shelf_slot INTEGER NOT NULL,
                status TEXT NOT NULL,
                FOREIGN KEY (shelf_id) REFERENCES shelves(id)
            );
            CREATE TABLE IF NOT EXISTS search_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                keyword TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS favorites (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                book_id INTEGER NOT NULL,
                created_at TEXT NOT NULL,
                UNIQUE(user_id, book_id)
            );
            """
        )
        shelves = generate_shelves()
        conn.executemany(
            """
            INSERT INTO shelves(id,row,col,pattern,capacity) VALUES(?,?,?,?,5)
            ON CONFLICT(id) DO UPDATE SET
                row=excluded.row,
                col=excluded.col,
                pattern=excluded.pattern,
                capacity=excluded.capacity
            """,
            shelves,
        )
        shelf_ids = [shelf[0] for shelf in shelves]
        conn.execute(
            f"DELETE FROM shelves WHERE id NOT IN ({','.join('?' for _ in shelf_ids)})",
            shelf_ids,
        )
        book_count = conn.execute("SELECT COUNT(*) FROM books").fetchone()[0]
        if book_count == 0:
            records = parse_docx_table(BOOK_DOCX) if BOOK_DOCX.exists() else []
            books = assign_books_to_shelves(records) if records else fallback_books()
            conn.executemany(
                """
                INSERT INTO books(book_id,source_index,title,author,pages,description,category,shelf_id,shelf_slot,status)
                VALUES(:book_id,:source_index,:title,:author,:pages,:description,:category,:shelf_id,:shelf_slot,:status)
                """,
                books,
            )
        else:
            rows = conn.execute("SELECT id FROM books ORDER BY id").fetchall()
            conn.executemany(
                "UPDATE books SET shelf_id=?, shelf_slot=? WHERE id=?",
                [
                    (shelf_id_for_book(index), ((index - 1) // len(shelves)) + 1, row["id"])
                    for index, row in enumerate(rows, start=1)
                ],
            )
        user = conn.execute("SELECT id FROM users WHERE username='demo'").fetchone()
        if not user:
            conn.execute(
                "INSERT INTO users(username,password_hash,created_at) VALUES(?,?,?)",
                ("demo", hash_password("demo123"), now()),
            )


def row_to_dict(row: sqlite3.Row) -> dict[str, Any]:
    return {key: row[key] for key in row.keys()}


def mark_favorites(conn: sqlite3.Connection, rows: list[sqlite3.Row], user_id: int | None) -> list[dict[str, Any]]:
    items = [row_to_dict(row) for row in rows]
    if not user_id or not items:
        for item in items:
            item["is_favorite"] = False
        return items

    ids = [item["id"] for item in items]
    placeholders = ",".join("?" for _ in ids)
    favorite_ids = {
        row["book_id"]
        for row in conn.execute(
            f"SELECT book_id FROM favorites WHERE user_id=? AND book_id IN ({placeholders})",
            [user_id, *ids],
        ).fetchall()
    }
    for item in items:
        item["is_favorite"] = item["id"] in favorite_ids
    return items


def get_user(handler: BaseHTTPRequestHandler) -> int | None:
    auth = handler.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        return TOKENS.get(auth.removeprefix("Bearer ").strip())
    return None


def grid() -> list[list[int]]:
    cells = [[CELL_EMPTY for _ in range(GRID_SIZE)] for _ in range(GRID_SIZE)]
    for row in CROWDED_ROWS:
        for col in CROWDED_COLS:
            cells[row][col] = CELL_CROWDED
    for row, col in reading_seats():
        cells[row][col] = CELL_READING
    for _, row, col, _ in generate_shelves():
        cells[row][col] = CELL_SHELF
    cells[ENTRANCE[0]][ENTRANCE[1]] = CELL_ENTRANCE
    return cells


def is_reading_cell(point: tuple[int, int]) -> bool:
    row, col = point
    return 0 <= row < GRID_SIZE and 0 <= col < GRID_SIZE and grid()[row][col] == CELL_READING


def is_walkable(point: tuple[int, int], target: tuple[int, int] | None = None) -> bool:
    row, col = point
    if not (0 <= row < GRID_SIZE and 0 <= col < GRID_SIZE):
        return False
    value = grid()[row][col]
    if value == CELL_SHELF:
        return False
    if value == CELL_READING and point != target:
        return False
    return True


def movement_cost(point: tuple[int, int]) -> int:
    row, col = point
    return 2 if grid()[row][col] == CELL_CROWDED else 1


def path_cost(path: list[list[int]]) -> int:
    return sum(movement_cost((row, col)) for row, col in (tuple(p) for p in path[1:]))


def neighbors(point: tuple[int, int], target: tuple[int, int] | None = None) -> list[tuple[int, int]]:
    cells = grid()
    result = []
    row, col = point
    for dr, dc in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        nr, nc = row + dr, col + dc
        if 0 <= nr < GRID_SIZE and 0 <= nc < GRID_SIZE and cells[nr][nc] != CELL_SHELF and is_walkable((nr, nc), target):
            result.append((nr, nc))
    return result


def reconstruct(came_from: dict[tuple[int, int], tuple[int, int] | None], end: tuple[int, int]) -> list[list[int]]:
    path = []
    current: tuple[int, int] | None = end
    while current is not None:
        path.append([current[0], current[1]])
        current = came_from[current]
    return list(reversed(path))


def normalize_path_algorithm(algorithm: str) -> str:
    value = (algorithm or "astar_manhattan").lower()
    aliases = {
        "astar": "astar_manhattan",
        "a*": "astar_manhattan",
        "a_star": "astar_manhattan",
        "manhattan": "astar_manhattan",
        "euclidean": "astar_euclidean",
    }
    return aliases.get(value, value)


def heuristic(point: tuple[int, int], target: tuple[int, int], algorithm: str) -> float:
    dr = abs(point[0] - target[0])
    dc = abs(point[1] - target[1])
    if algorithm == "astar_euclidean":
        return math.hypot(dr, dc)
    return dr + dc


def search_path(start: tuple[int, int], target: tuple[int, int], algorithm: str) -> dict[str, Any]:
    started = time.perf_counter()
    algorithm = normalize_path_algorithm(algorithm)
    expanded = 0
    if not is_walkable(start, target) or not is_walkable(target, target):
        return {"path": [], "distance": None, "expanded": expanded, "runtimeMs": elapsed(started)}

    if algorithm == "bfs":
        queue = deque([start])
        came_from = {start: None}
        while queue:
            current = queue.popleft()
            expanded += 1
            if current == target:
                path = reconstruct(came_from, target)
                return {"path": path, "distance": path_cost(path), "expanded": expanded, "runtimeMs": elapsed(started)}
            for nxt in neighbors(current, target):
                if nxt not in came_from:
                    came_from[nxt] = current
                    queue.append(nxt)
    else:
        heap: list[tuple[float, int, tuple[int, int]]] = [(heuristic(start, target, algorithm) if algorithm.startswith("astar_") else 0, 0, start)]
        came_from = {start: None}
        cost = {start: 0}
        while heap:
            _, current_cost, current = heapq.heappop(heap)
            if current_cost != cost[current]:
                continue
            expanded += 1
            if current == target:
                path = reconstruct(came_from, target)
                return {"path": path, "distance": current_cost, "expanded": expanded, "runtimeMs": elapsed(started)}
            for nxt in neighbors(current, target):
                new_cost = current_cost + movement_cost(nxt)
                if nxt not in cost or new_cost < cost[nxt]:
                    cost[nxt] = new_cost
                    came_from[nxt] = current
                    priority = new_cost + (heuristic(nxt, target, algorithm) if algorithm.startswith("astar_") else 0)
                    heapq.heappush(heap, (priority, new_cost, nxt))

    return {"path": [], "distance": None, "expanded": expanded, "runtimeMs": elapsed(started)}


def elapsed(started: float) -> float:
    return round((time.perf_counter() - started) * 1000, 3)


def pickup_point(shelf: sqlite3.Row) -> tuple[int, int]:
    row, col = shelf["row"], shelf["col"]
    candidates = [(row, col - 1), (row, col + 1), (row - 1, col), (row + 1, col)]
    for r, c in candidates:
        if is_walkable((r, c)):
            return (r, c)
    return (row, col)


def pickup_side(shelf_row: int, shelf_col: int, pickup: tuple[int, int]) -> str:
    row, col = pickup
    if row == shelf_row and col == shelf_col - 1:
        return "左侧通道"
    if row == shelf_row and col == shelf_col + 1:
        return "右侧通道"
    if row == shelf_row - 1 and col == shelf_col:
        return "上方通道"
    if row == shelf_row + 1 and col == shelf_col:
        return "下方通道"
    return "附近通道"


def movement_instructions(path: list[list[int]]) -> list[str]:
    if len(path) < 2:
        return []

    directions = {
        (1, 0): "向下",
        (-1, 0): "向上",
        (0, 1): "向右",
        (0, -1): "向左",
    }
    instructions = []
    current_direction = None
    steps = 0

    for prev, current in zip(path, path[1:]):
        delta = (current[0] - prev[0], current[1] - prev[1])
        direction = directions.get(delta, "移动")
        if direction == current_direction:
            steps += 1
        else:
            if current_direction:
                instructions.append(f"{current_direction}走 {steps} 格")
            current_direction = direction
            steps = 1

    if current_direction:
        instructions.append(f"{current_direction}走 {steps} 格")
    return instructions


def json_response(handler: BaseHTTPRequestHandler, status: int, payload: Any) -> None:
    data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(data)))
    handler.end_headers()
    handler.wfile.write(data)


def parse_end_point(value: Any) -> tuple[int, int]:
    if isinstance(value, list) and len(value) == 2:
        point = (int(value[0]), int(value[1]))
        if is_reading_cell(point):
            return point
    return DEFAULT_SEAT


def normalize_algorithm(value: Any) -> str:
    algorithm = normalize_path_algorithm(str(value or "astar_manhattan"))
    return algorithm if algorithm in {"astar_manhattan", "astar_euclidean", "bfs", "ucs"} else "astar_manhattan"


def normalize_method(value: Any) -> str:
    method = normalize_order_method(str(value or "greedy"))
    return method if method in {"greedy", "greedy_2opt", "state_astar", "branch_bound"} else "greedy"


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt: str, *args: Any) -> None:
        print("%s - %s" % (self.address_string(), fmt % args))

    def do_GET(self) -> None:
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        query = urllib.parse.parse_qs(parsed.query)

        if path.startswith("/api/"):
            return self.handle_get(path, query)
        return self.serve_static(path)

    def do_POST(self) -> None:
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path.startswith("/api/"):
            return self.handle_post(parsed.path, self.body())
        json_response(self, 404, {"error": "Not found"})

    def do_DELETE(self) -> None:
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path.startswith("/api/"):
            return self.handle_delete(parsed.path)
        json_response(self, 404, {"error": "Not found"})

    def body(self) -> dict[str, Any]:
        length = int(self.headers.get("Content-Length", 0))
        if length == 0:
            return {}
        return json.loads(self.rfile.read(length).decode("utf-8"))

    def serve_static(self, path: str) -> None:
        if path == "/":
            path = "/index.html"
        target = (FRONTEND_DIR / path.lstrip("/")).resolve()
        if not str(target).startswith(str(FRONTEND_DIR.resolve())) or not target.exists():
            self.send_response(404)
            self.end_headers()
            return
        content_type = "text/html; charset=utf-8"
        if target.suffix == ".css":
            content_type = "text/css; charset=utf-8"
        elif target.suffix == ".js":
            content_type = "application/javascript; charset=utf-8"
        data = target.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def handle_get(self, path: str, query: dict[str, list[str]]) -> None:
        user_id = get_user(self)
        with connect() as conn:
            if path == "/api/auth/me":
                if not user_id:
                    return json_response(self, 401, {"error": "Unauthorized"})
                user = conn.execute("SELECT id,username,created_at,last_login_at FROM users WHERE id=?", (user_id,)).fetchone()
                return json_response(self, 200, row_to_dict(user))

            if path == "/api/books/search":
                keyword = query.get("keyword", [""])[0].strip()
                should_record = query.get("record", ["1"])[0] != "0"
                if user_id and keyword and should_record:
                    conn.execute("INSERT INTO search_history(user_id,keyword,created_at) VALUES(?,?,?)", (user_id, keyword, now()))
                like = f"%{keyword}%"
                rows = conn.execute(
                    """
                    SELECT b.*, s.row, s.col,
                           CASE
                               WHEN ?='' THEN 0
                               ELSE
                                   CASE WHEN b.title LIKE ? THEN 40 ELSE 0 END +
                                   CASE WHEN b.category LIKE ? THEN 30 ELSE 0 END +
                                   CASE WHEN b.author LIKE ? THEN 20 ELSE 0 END +
                                   CASE WHEN b.description LIKE ? THEN 5 ELSE 0 END
                           END AS match_score
                    FROM books b JOIN shelves s ON b.shelf_id=s.id
                    WHERE ?='' OR b.title LIKE ? OR b.author LIKE ? OR b.category LIKE ? OR b.description LIKE ?
                    ORDER BY match_score DESC, b.id ASC
                    LIMIT 80
                    """,
                    (keyword, like, like, like, like, keyword, like, like, like, like),
                ).fetchall()
                return json_response(self, 200, mark_favorites(conn, rows, user_id))

            if path == "/api/books/recommendations":
                limit = int(query.get("limit", ["10"])[0])
                return json_response(self, 200, recommendations(conn, user_id, limit))

            if path == "/api/users/me/search-history":
                if not user_id:
                    return json_response(self, 401, {"error": "Unauthorized"})
                rows = conn.execute(
                    "SELECT keyword,created_at FROM search_history WHERE user_id=? ORDER BY id DESC LIMIT 30",
                    (user_id,),
                ).fetchall()
                items = [row_to_dict(r) | {"is_favorite": True} for r in rows]
                return json_response(self, 200, items)

            if path in ("/api/favorites", "/api/users/me/favorites"):
                if not user_id:
                    return json_response(self, 401, {"error": "Unauthorized"})
                rows = favorite_rows(conn, user_id)
                return json_response(self, 200, [row_to_dict(r) for r in rows])

            if path == "/api/library-map":
                shelves = conn.execute("SELECT * FROM shelves ORDER BY id").fetchall()
                seats = [{"id": f"R{idx:02d}", "row": row, "col": col} for idx, (row, col) in enumerate(reading_seats(), start=1)]
                return json_response(
                    self,
                    200,
                    {
                        "size": GRID_SIZE,
                        "grid": grid(),
                        "shelves": [row_to_dict(r) for r in shelves],
                        "seats": seats,
                        "defaultSeat": list(DEFAULT_SEAT),
                    },
                )

            if path == "/api/stats":
                books = conn.execute("SELECT COUNT(*) FROM books").fetchone()[0]
                shelves = conn.execute("SELECT COUNT(*) FROM shelves").fetchone()[0]
                categories = conn.execute("SELECT category, COUNT(*) count FROM books GROUP BY category ORDER BY count DESC").fetchall()
                return json_response(self, 200, {"books": books, "shelves": shelves, "categories": [row_to_dict(r) for r in categories]})

        json_response(self, 404, {"error": "Not found"})

    def handle_post(self, path: str, data: dict[str, Any]) -> None:
        user_id = get_user(self)
        with connect() as conn:
            if path == "/api/auth/register":
                username = (data.get("username") or "").strip()
                password = data.get("password") or ""
                confirm = data.get("confirmPassword")
                if not username or not password:
                    return json_response(self, 400, {"error": "请提供用户名和密码"})
                if len(password) < 6:
                    return json_response(self, 400, {"error": "密码至少需要 6 位"})
                if confirm is not None and password != confirm:
                    return json_response(self, 400, {"error": "两次输入的密码不一致"})
                try:
                    conn.execute(
                        "INSERT INTO users(username,password_hash,created_at) VALUES(?,?,?)",
                        (username, hash_password(password), now()),
                    )
                    return json_response(self, 201, {"ok": True})
                except sqlite3.IntegrityError:
                    return json_response(self, 409, {"error": "用户名已存在"})

            if path == "/api/auth/login":
                user = conn.execute("SELECT * FROM users WHERE username=?", (data.get("username"),)).fetchone()
                if not user or user["password_hash"] != hash_password(data.get("password", "")):
                    return json_response(self, 401, {"error": "用户名或密码错误"})
                token = secrets.token_urlsafe(24)
                TOKENS[token] = user["id"]
                conn.execute("UPDATE users SET last_login_at=? WHERE id=?", (now(), user["id"]))
                return json_response(self, 200, {"token": token, "user": {"id": user["id"], "username": user["username"]}})

            if path == "/api/users/me/password":
                if not user_id:
                    return json_response(self, 401, {"error": "Unauthorized"})
                current_password = data.get("currentPassword", "")
                new_password = data.get("newPassword", "")
                if len(new_password) < 6:
                    return json_response(self, 400, {"error": "新密码至少需要 6 位"})
                user = conn.execute("SELECT * FROM users WHERE id=?", (user_id,)).fetchone()
                if not user or user["password_hash"] != hash_password(current_password):
                    return json_response(self, 401, {"error": "当前密码不正确"})
                conn.execute("UPDATE users SET password_hash=? WHERE id=?", (hash_password(new_password), user_id))
                return json_response(self, 200, {"ok": True})

            if path.startswith("/api/books/") and path.endswith("/favorite"):
                if not user_id:
                    return json_response(self, 401, {"error": "Unauthorized"})
                book_id = int(path.split("/")[3])
                conn.execute(
                    "INSERT OR IGNORE INTO favorites(user_id,book_id,created_at) VALUES(?,?,?)",
                    (user_id, book_id, now()),
                )
                return json_response(self, 200, {"ok": True})

            if path == "/api/pickup/plan":
                if not user_id:
                    return json_response(self, 401, {"error": "Unauthorized"})
                algorithm = normalize_algorithm(data.get("algorithm"))
                book_ids = [int(x) for x in data.get("bookIds", [])]
                end = parse_end_point(data.get("end"))
                return json_response(self, 200, plan_pickup(conn, book_ids, algorithm, end))

            if path == "/api/pickup/solve":
                if not user_id:
                    return json_response(self, 401, {"error": "Unauthorized"})
                algorithm = normalize_algorithm(data.get("algorithm"))
                method = normalize_method(data.get("method"))
                book_ids = [int(x) for x in data.get("bookIds", [])]
                end = parse_end_point(data.get("end"))
                result = solve_pickup(conn, book_ids, algorithm, method, end)
                if "error" in result:
                    return json_response(self, 400, result)
                return json_response(self, 200, result)

        json_response(self, 404, {"error": "Not found"})

    def handle_delete(self, path: str) -> None:
        user_id = get_user(self)
        if not user_id:
            return json_response(self, 401, {"error": "Unauthorized"})
        with connect() as conn:
            if path.startswith("/api/books/") and path.endswith("/favorite"):
                book_id = int(path.split("/")[3])
                conn.execute("DELETE FROM favorites WHERE user_id=? AND book_id=?", (user_id, book_id))
                return json_response(self, 200, {"ok": True})
        json_response(self, 404, {"error": "Not found"})


def favorite_rows(conn: sqlite3.Connection, user_id: int) -> list[sqlite3.Row]:
    return conn.execute(
        """
        SELECT b.*, s.row, s.col, f.created_at favorite_at
        FROM favorites f
        JOIN books b ON f.book_id=b.id
        JOIN shelves s ON b.shelf_id=s.id
        WHERE f.user_id=?
        ORDER BY f.id DESC
        """,
        (user_id,),
    ).fetchall()


def book_text(row: sqlite3.Row | dict[str, Any]) -> str:
    return " ".join(
        str(row.get(key, "") if isinstance(row, dict) else row[key] or "")
        for key in ("title", "author", "category", "description")
    )


def tokenize(text: str) -> list[str]:
    # English words/numbers and Chinese phrases are both useful in this dataset.
    return [
        token.lower()
        for token in re.findall(r"[A-Za-z0-9]+|[\u4e00-\u9fff]+", text)
        if len(token.strip()) >= 2
    ]


def tfidf_vectors(rows: list[sqlite3.Row]) -> tuple[list[dict[str, float]], dict[str, float]]:
    documents = [tokenize(book_text(row)) for row in rows]
    document_frequency: Counter[str] = Counter()
    for tokens in documents:
        document_frequency.update(set(tokens))

    total_documents = max(len(documents), 1)
    idf = {
        token: math.log((total_documents + 1) / (frequency + 1)) + 1
        for token, frequency in document_frequency.items()
    }

    vectors = []
    for tokens in documents:
        term_frequency = Counter(tokens)
        vector = {
            token: count * idf[token]
            for token, count in term_frequency.items()
        }
        normalize_vector(vector)
        vectors.append(vector)
    return vectors, idf


def normalize_vector(vector: dict[str, float]) -> None:
    norm = math.sqrt(sum(value * value for value in vector.values()))
    if norm == 0:
        return
    for key in list(vector.keys()):
        vector[key] /= norm


def cosine_similarity(left: dict[str, float], right: dict[str, float]) -> float:
    if len(left) > len(right):
        left, right = right, left
    return sum(value * right.get(token, 0.0) for token, value in left.items())


def user_interest_vector(
    history: list[sqlite3.Row],
    favorites: list[sqlite3.Row],
    idf: dict[str, float],
) -> dict[str, float]:
    weighted_terms: Counter[str] = Counter()
    for row in history:
        weighted_terms.update({token: 3 for token in tokenize(row["keyword"])})
    for row in favorites:
        weighted_terms.update({token: 2 for token in tokenize(book_text(row))})

    vector = {
        token: count * idf.get(token, 1.0)
        for token, count in weighted_terms.items()
    }
    normalize_vector(vector)
    return vector


def recommendations(conn: sqlite3.Connection, user_id: int | None, limit: int) -> list[dict[str, Any]]:
    if not user_id:
        rows = conn.execute(
            "SELECT b.*, s.row, s.col FROM books b JOIN shelves s ON b.shelf_id=s.id ORDER BY b.id LIMIT ?",
            (limit,),
        ).fetchall()
        return [item | {"reason": "默认推荐", "recommendation_method": "default"} for item in mark_favorites(conn, rows, user_id)]

    history = conn.execute("SELECT keyword FROM search_history WHERE user_id=? ORDER BY id DESC LIMIT 20", (user_id,)).fetchall()
    favs = favorite_rows(conn, user_id)

    rows = conn.execute(
        """
        SELECT b.*, s.row, s.col FROM books b JOIN shelves s ON b.shelf_id=s.id
        LIMIT 1500
        """,
    ).fetchall()

    favorite_ids = {fav["id"] for fav in favs}
    candidate_rows = [row for row in rows if row["id"] not in favorite_ids]

    if history or favs:
        all_vectors, idf = tfidf_vectors(rows)
        vector_by_id = {row["id"]: vector for row, vector in zip(rows, all_vectors)}
        profile = user_interest_vector(history, favs, idf)
        scored = []
        for row in candidate_rows:
            score = cosine_similarity(profile, vector_by_id.get(row["id"], {}))
            if score > 0:
                item = row_to_dict(row)
                item["reason"] = f"TF-IDF 余弦相似度推荐：与搜索历史和收藏图书文本相似，相似度 {score:.3f}"
                item["recommendation_method"] = "tfidf_cosine_similarity"
                item["ml_score"] = round(score, 4)
                item["is_favorite"] = False
                scored.append((score, -row["id"], item))
        if scored:
            scored.sort(reverse=True)
            return [item for _, _, item in scored[:limit]]

    preferred_categories = Counter(r["category"] for r in favs)
    keywords = [r["keyword"] for r in history]
    scored = []
    for row in candidate_rows:
        text = f"{row['title']} {row['author']} {row['category']} {row['description']}".lower()
        score = preferred_categories[row["category"]] * 4
        score += sum(2 for kw in keywords if kw.lower() in text)
        if score > 0:
            reason = f"规则兜底推荐：与你的搜索历史和{row['category']}类收藏相似"
            scored.append((score, row["id"], row_to_dict(row) | {"reason": reason, "recommendation_method": "rule_based", "is_favorite": False}))
    if not scored:
        rows = conn.execute(
            "SELECT b.*, s.row, s.col FROM books b JOIN shelves s ON b.shelf_id=s.id ORDER BY b.id LIMIT ?",
            (limit,),
        ).fetchall()
        return [item | {"reason": "暂无足够历史，显示馆藏推荐", "recommendation_method": "default"} for item in mark_favorites(conn, rows, user_id)]
    scored.sort(reverse=True, key=lambda item: (item[0], -item[1]))
    return [item[2] for item in scored[:limit]]


def plan_pickup(conn: sqlite3.Connection, book_ids: list[int], algorithm: str, end: tuple[int, int] = DEFAULT_SEAT) -> dict[str, Any]:
    algorithm = normalize_path_algorithm(algorithm)
    rows = conn.execute(
        f"""
        SELECT b.id, b.book_id, b.title, b.shelf_id, s.row, s.col
        FROM books b JOIN shelves s ON b.shelf_id=s.id
        WHERE b.id IN ({','.join('?' for _ in book_ids) if book_ids else 'NULL'})
        """,
        book_ids,
    ).fetchall()
    targets = [
        row_to_dict(row) | {"pickup": list(pickup_point(row))}
        for row in rows
    ]
    current = ENTRANCE
    unvisited = targets[:]
    full_path: list[list[int]] = [[ENTRANCE[0], ENTRANCE[1]]]
    visit_order = []
    segments = []
    total_distance = 0
    total_expanded = 0
    solver_expanded = 0
    total_runtime = 0.0
    previous_label = "入口"

    while unvisited:
        best = None
        for target in unvisited:
            solver_expanded += 1
            result = search_path(current, tuple(target["pickup"]), algorithm)
            if result["distance"] is not None and (best is None or result["distance"] < best[0]["distance"]):
                best = (result, target)
        if best is None:
            break
        segment, target = best
        full_path.extend(segment["path"][1:])
        total_distance += segment["distance"]
        total_expanded += segment["expanded"]
        total_runtime += segment["runtimeMs"]
        visit_order.append(target)
        side = pickup_side(target["row"], target["col"], tuple(target["pickup"]))
        segments.append(
            {
                "type": "book",
                "from": previous_label,
                "to": target["shelf_id"],
                "bookId": target["id"],
                "bookCode": target["book_id"],
                "bookTitle": target["title"],
                "shelfId": target["shelf_id"],
                "shelfPosition": [target["row"], target["col"]],
                "pickup": target["pickup"],
                "pickupSide": side,
                "distance": segment["distance"],
                "expanded": segment["expanded"],
                "runtimeMs": segment["runtimeMs"],
                "path": segment["path"],
                "instructions": movement_instructions(segment["path"]),
                "summary": f"从{previous_label}出发，到达 {target['shelf_id']} {side}，取《{target['title']}》。",
            }
        )
        current = tuple(target["pickup"])
        previous_label = target["shelf_id"]
        unvisited.remove(target)

    end_segment = search_path(current, end, algorithm)
    if end_segment["distance"] is not None:
        full_path.extend(end_segment["path"][1:])
        total_distance += end_segment["distance"]
        total_expanded += end_segment["expanded"]
        total_runtime += end_segment["runtimeMs"]
        segments.append(
            {
                "type": "seat",
                "from": previous_label,
                "to": "阅读区座位",
                "distance": end_segment["distance"],
                "expanded": end_segment["expanded"],
                "runtimeMs": end_segment["runtimeMs"],
                "path": end_segment["path"],
                "instructions": movement_instructions(end_segment["path"]),
                "summary": f"从{previous_label}前往阅读区座位，完成本次取书。",
            }
        )

    return {
        "algorithm": algorithm,
        "distance": total_distance,
        "expanded": total_expanded,
        "pathExpanded": total_expanded,
        "solverExpanded": solver_expanded,
        "runtimeMs": round(total_runtime, 3),
        "path": full_path,
        "segments": segments,
        "visitOrder": visit_order,
        "unreachable": unvisited,
        "end": list(end),
    }


def pickup_targets(conn: sqlite3.Connection, book_ids: list[int]) -> list[dict[str, Any]]:
    rows = conn.execute(
        f"""
        SELECT b.id, b.book_id, b.title, b.shelf_id, s.row, s.col
        FROM books b JOIN shelves s ON b.shelf_id=s.id
        WHERE b.id IN ({','.join('?' for _ in book_ids) if book_ids else 'NULL'})
        """,
        book_ids,
    ).fetchall()
    return [row_to_dict(row) | {"pickup": list(pickup_point(row))} for row in rows]


def normalize_order_method(method: str) -> str:
    value = (method or "greedy").lower()
    aliases = {
        "planning": "state_astar",
        "state-space": "state_astar",
        "state_space": "state_astar",
        "state-space-astar": "state_astar",
        "state_space_astar": "state_astar",
        "csp": "branch_bound",
        "branch-and-bound": "branch_bound",
        "branch_and_bound": "branch_bound",
        "bnb": "branch_bound",
        "two_opt": "greedy_2opt",
        "greedy_2_opt": "greedy_2opt",
        "greedy+2opt": "greedy_2opt",
    }
    return aliases.get(value, value)


def solve_pickup(conn: sqlite3.Connection, book_ids: list[int], algorithm: str, method: str, end: tuple[int, int] = DEFAULT_SEAT) -> dict[str, Any]:
    algorithm = normalize_path_algorithm(algorithm)
    method = normalize_order_method(method)
    if method == "greedy":
        plan = plan_pickup(conn, book_ids, algorithm, end)
        plan["method"] = method
        return plan

    targets = pickup_targets(conn, book_ids)
    if not targets:
        return {"algorithm": algorithm, "method": method, "distance": 0, "expanded": 0, "runtimeMs": 0.0, "path": [[ENTRANCE[0], ENTRANCE[1]]], "segments": [], "visitOrder": [], "unreachable": [], "end": list(end)}

    if method in {"state_astar", "branch_bound"} and len(targets) > 10:
        return {"error": "状态空间 A* / 分支限界目前仅支持最多 10 本书（组合空间过大），请减少选择或使用贪心类算法。"}

    started = time.perf_counter()
    points = compute_keypoints(targets, end)
    pair_results, pre_expanded, pre_runtime = precompute_paths(points, algorithm)

    if method == "greedy_2opt":
        order, solver_expanded = greedy_two_opt_pickup_order(pair_results, len(targets))
    elif method == "state_astar":
        order, solver_expanded = state_space_astar_pickup_order(pair_results, len(targets))
    elif method == "branch_bound":
        order, solver_expanded = branch_bound_pickup_order(pair_results, len(targets))
    else:
        return {"error": f"Unknown method: {method}"}

    plan = plan_pickup_with_order(targets, order, algorithm, pair_results, end)
    plan["method"] = method
    plan["solverExpanded"] = solver_expanded
    plan["pathExpanded"] = pre_expanded
    plan["precomputeExpanded"] = pre_expanded
    plan["precomputeRuntimeMs"] = round(pre_runtime, 3)
    plan["runtimeMs"] = round((time.perf_counter() - started) * 1000, 3)
    plan["expanded"] = int(pre_expanded or 0) + int(solver_expanded or 0)
    return plan


def compute_keypoints(targets: list[dict[str, Any]], end: tuple[int, int] = DEFAULT_SEAT) -> list[tuple[int, int]]:
    return [ENTRANCE, *[tuple(t["pickup"]) for t in targets], end]


def precompute_paths(
    points: list[tuple[int, int]],
    algorithm: str,
) -> tuple[dict[tuple[int, int], dict[str, Any]], int, float]:
    results: dict[tuple[int, int], dict[str, Any]] = {}
    total_expanded = 0
    total_runtime = 0.0
    for i, src in enumerate(points):
        for j, dst in enumerate(points):
            if i == j:
                continue
            res = search_path(src, dst, algorithm)
            results[(i, j)] = res
            total_expanded += int(res.get("expanded") or 0)
            total_runtime += float(res.get("runtimeMs") or 0.0)
    return results, total_expanded, total_runtime


def best_segment(
    pair_results: dict[tuple[int, int], dict[str, Any]],
    src_idx: int,
    dst_idx: int,
) -> dict[str, Any]:
    return pair_results.get((src_idx, dst_idx), {"path": [], "distance": None, "expanded": 0, "runtimeMs": 0.0})


def route_order_cost(
    pair_results: dict[tuple[int, int], dict[str, Any]],
    order: list[int],
    target_count: int,
) -> int | None:
    current_idx = 0
    total = 0
    for target_idx in order:
        distance = best_segment(pair_results, current_idx, target_idx).get("distance")
        if distance is None:
            return None
        total += int(distance)
        current_idx = target_idx
    final_distance = best_segment(pair_results, current_idx, target_count + 1).get("distance")
    if final_distance is None:
        return None
    return total + int(final_distance)


def greedy_pickup_order(
    pair_results: dict[tuple[int, int], dict[str, Any]],
    target_count: int,
) -> tuple[list[int], int]:
    current_idx = 0
    remaining = set(range(1, target_count + 1))
    order: list[int] = []
    solver_expanded = 0
    while remaining:
        candidates = []
        for target_idx in remaining:
            solver_expanded += 1
            distance = best_segment(pair_results, current_idx, target_idx).get("distance")
            if distance is not None:
                candidates.append((int(distance), target_idx))
        if not candidates:
            break
        _, next_idx = min(candidates)
        order.append(next_idx)
        remaining.remove(next_idx)
        current_idx = next_idx
    return order, solver_expanded


def greedy_two_opt_pickup_order(
    pair_results: dict[tuple[int, int], dict[str, Any]],
    target_count: int,
) -> tuple[list[int], int]:
    order, solver_expanded = greedy_pickup_order(pair_results, target_count)
    if len(order) < 3:
        return order, solver_expanded

    best_cost = route_order_cost(pair_results, order, target_count)
    if best_cost is None:
        return order, solver_expanded

    improved = True
    while improved:
        improved = False
        for i in range(len(order) - 1):
            for j in range(i + 2, len(order) + 1):
                if i == 0 and j == len(order):
                    continue
                solver_expanded += 1
                candidate = order[:i] + list(reversed(order[i:j])) + order[j:]
                candidate_cost = route_order_cost(pair_results, candidate, target_count)
                if candidate_cost is not None and candidate_cost < best_cost:
                    order = candidate
                    best_cost = candidate_cost
                    improved = True
                    break
            if improved:
                break
    return order, solver_expanded


def branch_bound_pickup_order(
    pair_results: dict[tuple[int, int], dict[str, Any]],
    target_count: int,
) -> tuple[list[int], int]:
    # Branch-and-bound view:
    # - Variables: order position k in [0..n-1]
    # - Domain: targets {1..n}
    # - Constraints: all-different
    # - Objective: minimize sum(dist(prev, next)) + dist(last, exit)
    #
    # We solve via backtracking + branch-and-bound.
    solver_expanded = 0
    targets = list(range(1, target_count + 1))

    dist: dict[tuple[int, int], int] = {}
    for i in range(0, target_count + 2):
        for j in range(0, target_count + 2):
            if i == j:
                continue
            d = best_segment(pair_results, i, j).get("distance")
            if d is not None:
                dist[(i, j)] = int(d)

    exit_idx = target_count + 1
    min_out: dict[int, int] = {}
    for i in range(0, target_count + 1):  # exclude exit itself
        candidates = []
        for j in range(1, target_count + 1):
            if i != j and (i, j) in dist:
                candidates.append(dist[(i, j)])
        if (i, exit_idx) in dist:
            candidates.append(dist[(i, exit_idx)])
        min_out[i] = min(candidates) if candidates else 10**9

    best_cost = 10**18
    best_order: list[int] = []

    def lower_bound(current_idx: int, remaining: list[int]) -> int:
        if not remaining:
            return dist.get((current_idx, exit_idx), 10**9)
        lb = min(dist.get((current_idx, t), 10**9) for t in remaining)
        lb += sum(min_out.get(t, 10**9) for t in remaining)
        return lb

    def backtrack(current_idx: int, remaining: list[int], cost_so_far: int, order: list[int]) -> None:
        nonlocal best_cost, best_order, solver_expanded
        solver_expanded += 1
        if cost_so_far >= best_cost:
            return
        if cost_so_far + lower_bound(current_idx, remaining) >= best_cost:
            return
        if not remaining:
            final_leg = dist.get((current_idx, exit_idx))
            if final_leg is None:
                return
            total = cost_so_far + final_leg
            if total < best_cost:
                best_cost = total
                best_order = order[:]
            return

        remaining_sorted = sorted(remaining, key=lambda t: dist.get((current_idx, t), 10**9))
        for t in remaining_sorted:
            step = dist.get((current_idx, t))
            if step is None:
                continue
            nxt_remaining = [x for x in remaining if x != t]
            order.append(t)
            backtrack(t, nxt_remaining, cost_so_far + step, order)
            order.pop()

    backtrack(0, targets, 0, [])
    return best_order, solver_expanded


def state_space_astar_pickup_order(
    pair_results: dict[tuple[int, int], dict[str, Any]],
    target_count: int,
) -> tuple[list[int], int]:
    # State-space A* view:
    # - State: (at_index, visited_mask)
    # - Actions: pick(target_i) moves to i, cost = dist(at, i)
    # - Goal: all targets visited, then go to exit (handled after reconstruction)
    #
    # We solve with A* on this explicit state space.
    solver_expanded = 0
    exit_idx = target_count + 1

    dist: dict[tuple[int, int], int] = {}
    for i in range(0, target_count + 2):
        for j in range(0, target_count + 2):
            if i == j:
                continue
            d = best_segment(pair_results, i, j).get("distance")
            if d is not None:
                dist[(i, j)] = int(d)

    all_mask = (1 << target_count) - 1

    def h(at_idx: int, mask: int) -> int:
        if mask == all_mask:
            return dist.get((at_idx, exit_idx), 0)
        candidates = []
        for t in range(1, target_count + 1):
            bit = 1 << (t - 1)
            if (mask & bit) == 0:
                candidates.append(dist.get((at_idx, t), 10**9))
        return min(candidates) if candidates else 0

    start = (0, 0)
    heap: list[tuple[int, int, tuple[int, int]]] = [(h(*start), 0, start)]
    best_g: dict[tuple[int, int], int] = {start: 0}
    came_from: dict[tuple[int, int], tuple[tuple[int, int], int] | None] = {start: None}

    while heap:
        _, g, state = heapq.heappop(heap)
        if g != best_g.get(state, 10**18):
            continue
        solver_expanded += 1
        at_idx, mask = state
        if mask == all_mask:
            order: list[int] = []
            cur = state
            while came_from[cur] is not None:
                prev, action_target = came_from[cur]
                order.append(action_target)
                cur = prev
            order.reverse()
            return order, solver_expanded

        for t in range(1, target_count + 1):
            bit = 1 << (t - 1)
            if mask & bit:
                continue
            step = dist.get((at_idx, t))
            if step is None:
                continue
            nxt = (t, mask | bit)
            ng = g + step
            if ng < best_g.get(nxt, 10**18):
                best_g[nxt] = ng
                came_from[nxt] = (state, t)
                heapq.heappush(heap, (ng + h(*nxt), ng, nxt))

    return [], solver_expanded


def plan_pickup_with_order(
    targets: list[dict[str, Any]],
    order: list[int],
    algorithm: str,
    pair_results: dict[tuple[int, int], dict[str, Any]],
    end: tuple[int, int] = DEFAULT_SEAT,
) -> dict[str, Any]:
    current_idx = 0
    full_path: list[list[int]] = [[ENTRANCE[0], ENTRANCE[1]]]
    visit_order: list[dict[str, Any]] = []
    segments: list[dict[str, Any]] = []
    total_distance = 0
    total_expanded = 0
    total_runtime = 0.0
    previous_label = "入口"

    for t_idx in order:
        target = targets[t_idx - 1]
        seg = best_segment(pair_results, current_idx, t_idx)
        if seg.get("distance") is None:
            continue
        full_path.extend(seg["path"][1:])
        total_distance += int(seg["distance"])
        total_expanded += int(seg.get("expanded") or 0)
        total_runtime += float(seg.get("runtimeMs") or 0.0)
        visit_order.append(target)
        side = pickup_side(target["row"], target["col"], tuple(target["pickup"]))
        segments.append(
            {
                "type": "book",
                "from": previous_label,
                "to": target["shelf_id"],
                "bookId": target["id"],
                "bookCode": target["book_id"],
                "bookTitle": target["title"],
                "shelfId": target["shelf_id"],
                "shelfPosition": [target["row"], target["col"]],
                "pickup": target["pickup"],
                "pickupSide": side,
                "distance": int(seg["distance"]),
                "expanded": int(seg.get("expanded") or 0),
                "runtimeMs": float(seg.get("runtimeMs") or 0.0),
                "path": seg["path"],
                "instructions": movement_instructions(seg["path"]),
                "summary": f"从{previous_label}出发，到达 {target['shelf_id']} {side}，取《{target['title']}》。",
            }
        )
        current_idx = t_idx
        previous_label = target["shelf_id"]

    exit_idx = len(targets) + 1
    end_seg = best_segment(pair_results, current_idx, exit_idx)
    if end_seg.get("distance") is not None:
        full_path.extend(end_seg["path"][1:])
        total_distance += int(end_seg["distance"])
        total_expanded += int(end_seg.get("expanded") or 0)
        total_runtime += float(end_seg.get("runtimeMs") or 0.0)
        segments.append(
            {
                "type": "seat",
                "from": previous_label,
                "to": "阅读区座位",
                "distance": int(end_seg["distance"]),
                "expanded": int(end_seg.get("expanded") or 0),
                "runtimeMs": float(end_seg.get("runtimeMs") or 0.0),
                "path": end_seg["path"],
                "instructions": movement_instructions(end_seg["path"]),
                "summary": f"从{previous_label}前往阅读区座位，完成本次取书。",
            }
        )

    return {
        "algorithm": algorithm,
        "distance": total_distance,
        "expanded": total_expanded,
        "runtimeMs": round(total_runtime, 3),
        "path": full_path,
        "segments": segments,
        "visitOrder": visit_order,
        "unreachable": [],
        "end": list(end),
    }


def main() -> None:
    init_db()
    port = int(os.environ.get("PORT", "8000"))
    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    print(f"Library borrowing system running at http://127.0.0.1:{port}")
    server.serve_forever()


if __name__ == "__main__":
    main()
