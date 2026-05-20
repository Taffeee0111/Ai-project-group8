from __future__ import annotations

import hashlib
import heapq
import json
import math
import os
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


ROOT = Path(__file__).resolve().parents[1]
DB_PATH = ROOT / "backend" / "data" / "library.db"
FRONTEND_DIR = ROOT / "frontend" / "static"
BOOK_DOCX = Path(
    r"C:\Users\Lenovo\xwechat_files\wxid_7v70kqj8qvgp22_7bdd\msg\file\2026-05\book_collection_filled_1500.docx"
)

TOKENS: dict[str, int] = {}
GRID_SIZE = 24
SHELF_ROWS = list(range(2, 22))
SHELF_COLS = [1, 2, 4, 5, 7, 8, 10, 11, 13, 14, 16, 17, 19, 20, 22]
AISLES = set(range(GRID_SIZE)) - set(SHELF_COLS)


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
    shelves = []
    idx = 1
    for row in SHELF_ROWS:
        for col in SHELF_COLS:
            shelves.append((f"S{idx:03d}", row, col, "shelf"))
            idx += 1
    return shelves


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
        shelf_num = math.ceil(index / 5)
        assigned.append(
            {
                "book_id": f"B{index:04d}",
                "source_index": record.get("序号", str(index)),
                "title": record.get("书名", f"Book {index}"),
                "author": record.get("作者", "Unknown"),
                "pages": record.get("页数（可选）", ""),
                "description": record.get("简介（可选）", ""),
                "category": category,
                "shelf_id": f"S{shelf_num:03d}",
                "shelf_slot": ((index - 1) % 5) + 1,
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
                "shelf_id": f"S{math.ceil(i / 5):03d}",
                "shelf_slot": ((i - 1) % 5) + 1,
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
        shelf_count = conn.execute("SELECT COUNT(*) FROM shelves").fetchone()[0]
        if shelf_count == 0:
            conn.executemany(
                "INSERT INTO shelves(id,row,col,pattern,capacity) VALUES(?,?,?,?,5)",
                generate_shelves(),
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
    cells = [[0 for _ in range(GRID_SIZE)] for _ in range(GRID_SIZE)]
    for row in SHELF_ROWS:
        for col in SHELF_COLS:
            cells[row][col] = 1
    cells[0][0] = 2
    cells[23][23] = 3
    return cells


def neighbors(point: tuple[int, int]) -> list[tuple[int, int]]:
    cells = grid()
    result = []
    row, col = point
    for dr, dc in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        nr, nc = row + dr, col + dc
        if 0 <= nr < GRID_SIZE and 0 <= nc < GRID_SIZE and cells[nr][nc] != 1:
            result.append((nr, nc))
    return result


def reconstruct(came_from: dict[tuple[int, int], tuple[int, int] | None], end: tuple[int, int]) -> list[list[int]]:
    path = []
    current: tuple[int, int] | None = end
    while current is not None:
        path.append([current[0], current[1]])
        current = came_from[current]
    return list(reversed(path))


def search_path(start: tuple[int, int], target: tuple[int, int], algorithm: str) -> dict[str, Any]:
    started = time.perf_counter()
    expanded = 0

    if algorithm == "bfs":
        queue = deque([start])
        came_from = {start: None}
        while queue:
            current = queue.popleft()
            expanded += 1
            if current == target:
                path = reconstruct(came_from, target)
                return {"path": path, "distance": len(path) - 1, "expanded": expanded, "runtimeMs": elapsed(started)}
            for nxt in neighbors(current):
                if nxt not in came_from:
                    came_from[nxt] = current
                    queue.append(nxt)
    else:
        def h(point: tuple[int, int]) -> int:
            return abs(point[0] - target[0]) + abs(point[1] - target[1])

        heap: list[tuple[int, int, tuple[int, int]]] = [(h(start) if algorithm == "astar" else 0, 0, start)]
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
            for nxt in neighbors(current):
                new_cost = current_cost + 1
                if nxt not in cost or new_cost < cost[nxt]:
                    cost[nxt] = new_cost
                    came_from[nxt] = current
                    priority = new_cost + (h(nxt) if algorithm == "astar" else 0)
                    heapq.heappush(heap, (priority, new_cost, nxt))

    return {"path": [], "distance": None, "expanded": expanded, "runtimeMs": elapsed(started)}


def elapsed(started: float) -> float:
    return round((time.perf_counter() - started) * 1000, 3)


def pickup_point(shelf: sqlite3.Row) -> tuple[int, int]:
    row, col = shelf["row"], shelf["col"]
    candidates = [(row, col - 1), (row, col + 1), (row - 1, col), (row + 1, col)]
    cells = grid()
    for r, c in candidates:
        if 0 <= r < GRID_SIZE and 0 <= c < GRID_SIZE and cells[r][c] != 1:
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
                return json_response(self, 200, {"size": GRID_SIZE, "grid": grid(), "shelves": [row_to_dict(r) for r in shelves]})

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
                try:
                    conn.execute(
                        "INSERT INTO users(username,password_hash,created_at) VALUES(?,?,?)",
                        (data["username"], hash_password(data["password"]), now()),
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
                algorithm = data.get("algorithm", "astar")
                book_ids = [int(x) for x in data.get("bookIds", [])]
                return json_response(self, 200, plan_pickup(conn, book_ids, algorithm))

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


def recommendations(conn: sqlite3.Connection, user_id: int | None, limit: int) -> list[dict[str, Any]]:
    if not user_id:
        rows = conn.execute(
            "SELECT b.*, s.row, s.col FROM books b JOIN shelves s ON b.shelf_id=s.id ORDER BY b.id LIMIT ?",
            (limit,),
        ).fetchall()
        return [item | {"reason": "默认推荐"} for item in mark_favorites(conn, rows, user_id)]

    history = conn.execute("SELECT keyword FROM search_history WHERE user_id=? ORDER BY id DESC LIMIT 20", (user_id,)).fetchall()
    favs = favorite_rows(conn, user_id)
    preferred_categories = Counter(r["category"] for r in favs)
    keywords = [r["keyword"] for r in history]

    rows = conn.execute(
        """
        SELECT b.*, s.row, s.col FROM books b JOIN shelves s ON b.shelf_id=s.id
        WHERE b.id NOT IN (SELECT book_id FROM favorites WHERE user_id=?)
        LIMIT 1500
        """,
        (user_id,),
    ).fetchall()
    scored = []
    for row in rows:
        text = f"{row['title']} {row['author']} {row['category']} {row['description']}".lower()
        score = preferred_categories[row["category"]] * 4
        score += sum(2 for kw in keywords if kw.lower() in text)
        if score > 0:
            reason = f"与你的搜索历史和{row['category']}类收藏相似"
            scored.append((score, row["id"], row_to_dict(row) | {"reason": reason}))
    if not scored:
        rows = conn.execute(
            "SELECT b.*, s.row, s.col FROM books b JOIN shelves s ON b.shelf_id=s.id ORDER BY b.id LIMIT ?",
            (limit,),
        ).fetchall()
        return [item | {"reason": "暂无足够历史，显示馆藏推荐"} for item in mark_favorites(conn, rows, user_id)]
    scored.sort(reverse=True, key=lambda item: (item[0], -item[1]))
    return [item[2] for item in scored[:limit]]


def plan_pickup(conn: sqlite3.Connection, book_ids: list[int], algorithm: str) -> dict[str, Any]:
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
    current = (0, 0)
    unvisited = targets[:]
    full_path: list[list[int]] = [[0, 0]]
    visit_order = []
    segments = []
    total_distance = 0
    total_expanded = 0
    total_runtime = 0.0
    previous_label = "入口"

    while unvisited:
        best = None
        for target in unvisited:
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

    end_segment = search_path(current, (23, 23), algorithm)
    if end_segment["distance"] is not None:
        full_path.extend(end_segment["path"][1:])
        total_distance += end_segment["distance"]
        total_expanded += end_segment["expanded"]
        total_runtime += end_segment["runtimeMs"]
        segments.append(
            {
                "type": "exit",
                "from": previous_label,
                "to": "出口",
                "distance": end_segment["distance"],
                "expanded": end_segment["expanded"],
                "runtimeMs": end_segment["runtimeMs"],
                "path": end_segment["path"],
                "instructions": movement_instructions(end_segment["path"]),
                "summary": f"从{previous_label}前往出口，完成本次取书。",
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
        "unreachable": unvisited,
    }


def main() -> None:
    init_db()
    port = int(os.environ.get("PORT", "8000"))
    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    print(f"Library borrowing system running at http://127.0.0.1:{port}")
    server.serve_forever()


if __name__ == "__main__":
    main()
