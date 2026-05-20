const state = {
  token: localStorage.getItem("token") || "",
  user: null,
  page: "search",
  map: null,
  path: [],
  targets: [],
};

const titles = {
  login: ["登录 / 注册", "进入系统后可保存搜索历史、收藏和取书计划。"],
  search: ["图书搜索", "搜索 1500 本馆藏图书，收藏后可生成取书路线。"],
  pickup: ["取书路径规划", "在 24 × 24 棋盘地图上比较 BFS、UCS 和 A* 搜索策略。"],
  profile: ["个人中心", "查看用户名、搜索历史和收藏图书。"],
};

function qs(selector) {
  return document.querySelector(selector);
}

function authHeaders() {
  return state.token ? { Authorization: `Bearer ${state.token}` } : {};
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
      ...(options.headers || {}),
    },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "请求失败");
  return data;
}

function setPage(page) {
  state.page = page;
  document.querySelectorAll(".page").forEach((el) => el.classList.remove("active"));
  document.querySelectorAll(".nav-button").forEach((el) => el.classList.remove("active"));
  qs(`#${page}Page`).classList.add("active");
  qs(`[data-page="${page}"]`).classList.add("active");
  qs("#pageTitle").textContent = titles[page][0];
  qs("#pageSubtitle").textContent = titles[page][1];
  if (page === "pickup") loadPickup();
  if (page === "profile") loadProfile();
}

function bookCard(book, options = {}) {
  const div = document.createElement("article");
  div.className = "book-card";
  div.innerHTML = `
    <h3>${escapeHtml(book.title)}</h3>
    <div class="book-meta">
      ${escapeHtml(book.author || "Unknown")} · <span class="tag">${escapeHtml(book.category || "未分类")}</span><br>
      书架 ${book.shelf_id} / 第 ${book.shelf_slot} 位 · 坐标 (${book.row}, ${book.col})
      ${book.reason ? `<br>推荐原因：${escapeHtml(book.reason)}` : ""}
    </div>
    <div class="book-actions">
      <span class="book-meta">${escapeHtml(book.status || "available")}</span>
      ${options.favorite ? `<button data-fav="${book.id}">收藏</button>` : ""}
      ${options.unfavorite ? `<button data-unfav="${book.id}">取消收藏</button>` : ""}
    </div>
  `;
  return div;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function loadStats() {
  const stats = await api("/api/stats");
  qs("#bookCount").textContent = stats.books;
  qs("#shelfCount").textContent = stats.shelves;
}

async function loadMe() {
  if (!state.token) {
    qs("#userChip").textContent = "未登录";
    return;
  }
  try {
    state.user = await api("/api/auth/me");
    qs("#userChip").textContent = state.user.username;
  } catch {
    localStorage.removeItem("token");
    state.token = "";
    qs("#userChip").textContent = "未登录";
  }
}

async function searchBooks() {
  const keyword = qs("#searchInput").value.trim();
  const books = await api(`/api/books/search?keyword=${encodeURIComponent(keyword)}`);
  const list = qs("#bookResults");
  list.innerHTML = "";
  books.forEach((book) => list.appendChild(bookCard(book, { favorite: true })));
  qs("#resultCount").textContent = `${books.length} 本`;
  loadRecommendations();
}

async function loadRecommendations() {
  const books = await api("/api/books/recommendations?limit=10");
  const list = qs("#recommendations");
  list.innerHTML = "";
  books.forEach((book) => list.appendChild(bookCard(book, { favorite: true })));
}

async function favoriteBook(bookId) {
  if (!state.token) {
    setPage("login");
    return;
  }
  await api(`/api/books/${bookId}/favorite`, { method: "POST", body: "{}" });
  await loadRecommendations();
}

async function unfavoriteBook(bookId) {
  await api(`/api/books/${bookId}/favorite`, { method: "DELETE" });
  if (state.page === "pickup") loadPickup();
  if (state.page === "profile") loadProfile();
}

async function loadPickup() {
  if (!state.token) {
    qs("#favoriteSelector").innerHTML = `<div class="profile-card">请先登录。</div>`;
    return;
  }
  const [favorites, map] = await Promise.all([api("/api/favorites"), api("/api/library-map")]);
  state.map = map;
  renderFavoriteSelector(favorites);
  renderMap();
}

function renderFavoriteSelector(favorites) {
  const box = qs("#favoriteSelector");
  box.innerHTML = "";
  if (!favorites.length) {
    box.innerHTML = `<div class="profile-card">还没有收藏图书。先去搜索页面收藏几本书。</div>`;
    return;
  }
  favorites.forEach((book) => {
    const item = document.createElement("label");
    item.className = "selector-item";
    item.innerHTML = `
      <input type="checkbox" value="${book.id}">
      <span><strong>${escapeHtml(book.title)}</strong><br><span class="book-meta">${book.category} · ${book.shelf_id} (${book.row}, ${book.col})</span></span>
    `;
    box.appendChild(item);
  });
}

function renderMap() {
  if (!state.map) return;
  const pathSet = new Set(state.path.map((p) => `${p[0]},${p[1]}`));
  const targetSet = new Set(state.targets.map((t) => `${t.row},${t.col}`));
  const grid = qs("#libraryGrid");
  grid.innerHTML = "";
  for (let r = 0; r < state.map.size; r++) {
    for (let c = 0; c < state.map.size; c++) {
      const cell = document.createElement("i");
      const value = state.map.grid[r][c];
      cell.className = "cell";
      if (value === 1) cell.classList.add("shelf");
      if (value === 2) cell.classList.add("entrance");
      if (value === 3) cell.classList.add("exit");
      if (pathSet.has(`${r},${c}`)) cell.className = "cell path";
      if (targetSet.has(`${r},${c}`)) cell.className = "cell target";
      cell.title = `(${r}, ${c})`;
      grid.appendChild(cell);
    }
  }
}

async function planPath() {
  const ids = [...document.querySelectorAll("#favoriteSelector input:checked")].map((el) => Number(el.value));
  if (!ids.length) {
    qs("#pathMetrics").textContent = "请至少选择一本收藏图书。";
    return;
  }
  const algorithm = qs("#algorithmSelect").value;
  const result = await api("/api/pickup/plan", {
    method: "POST",
    body: JSON.stringify({ bookIds: ids, algorithm }),
  });
  state.path = result.path || [];
  state.targets = result.visitOrder || [];
  qs("#pathMetrics").innerHTML = `
    策略：${result.algorithm.toUpperCase()}<br>
    路径长度：${result.distance} 步<br>
    扩展节点：${result.expanded}<br>
    运行时间：${result.runtimeMs} ms<br>
    访问顺序：${result.visitOrder.map((b) => `${escapeHtml(b.shelf_id)} ${escapeHtml(b.title)}`).join(" → ")}
  `;
  renderMap();
}

async function loadProfile() {
  if (!state.token) {
    qs("#profileInfo").innerHTML = "请先登录。";
    qs("#historyList").innerHTML = "";
    qs("#profileFavorites").innerHTML = "";
    return;
  }
  const [me, history, favorites] = await Promise.all([
    api("/api/auth/me"),
    api("/api/users/me/search-history"),
    api("/api/users/me/favorites"),
  ]);
  qs("#profileInfo").innerHTML = `
    <strong>${escapeHtml(me.username)}</strong><br>
    <span class="book-meta">注册时间：${escapeHtml(me.created_at)}<br>最近登录：${escapeHtml(me.last_login_at || "-")}</span>
  `;
  qs("#historyList").innerHTML = "";
  history.forEach((item) => {
    const div = document.createElement("div");
    div.className = "history-item";
    div.innerHTML = `<strong>${escapeHtml(item.keyword)}</strong><br><span class="book-meta">${escapeHtml(item.created_at)}</span>`;
    qs("#historyList").appendChild(div);
  });
  qs("#profileFavorites").innerHTML = "";
  favorites.forEach((book) => qs("#profileFavorites").appendChild(bookCard(book, { unfavorite: true })));
}

async function submitAuth() {
  const isRegister = qs("#registerTab").classList.contains("active");
  const username = qs("#authUsername").value.trim();
  const password = qs("#authPassword").value;
  try {
    if (isRegister) {
      await api("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({ username, password }),
      });
      qs("#authMessage").textContent = "注册成功，现在可以登录。";
      qs("#loginTab").click();
      return;
    }
    const data = await api("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
    state.token = data.token;
    localStorage.setItem("token", data.token);
    await loadMe();
    setPage("search");
  } catch (err) {
    qs("#authMessage").textContent = err.message;
  }
}

function bindEvents() {
  document.querySelectorAll(".nav-button").forEach((button) => {
    button.addEventListener("click", () => setPage(button.dataset.page));
  });
  qs("#searchButton").addEventListener("click", searchBooks);
  qs("#searchInput").addEventListener("keydown", (event) => {
    if (event.key === "Enter") searchBooks();
  });
  document.body.addEventListener("click", (event) => {
    const fav = event.target.closest("[data-fav]");
    const unfav = event.target.closest("[data-unfav]");
    if (fav) favoriteBook(fav.dataset.fav);
    if (unfav) unfavoriteBook(unfav.dataset.unfav);
  });
  qs("#refreshFavorites").addEventListener("click", loadPickup);
  qs("#planButton").addEventListener("click", planPath);
  qs("#authSubmit").addEventListener("click", submitAuth);
  qs("#loginTab").addEventListener("click", () => switchAuth(false));
  qs("#registerTab").addEventListener("click", () => switchAuth(true));
}

function switchAuth(register) {
  qs("#loginTab").classList.toggle("active", !register);
  qs("#registerTab").classList.toggle("active", register);
  qs("#authSubmit").textContent = register ? "注册" : "登录";
  qs("#authMessage").textContent = register ? "创建一个新账号。" : "演示账号：demo / demo123";
}

async function boot() {
  bindEvents();
  await loadStats();
  await loadMe();
  await searchBooks();
  await loadRecommendations();
}

boot().catch((err) => {
  document.body.innerHTML = `<pre style="padding:24px">${escapeHtml(err.stack || err.message)}</pre>`;
});
