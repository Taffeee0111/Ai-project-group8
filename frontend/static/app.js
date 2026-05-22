const state = {
  token: localStorage.getItem("token") || "",
  user: null,
  page: "search",
  map: null,
  path: [],
  targets: [],
  segments: [],
  activeSegment: null,
  playbackTimer: null,
  playbackIndex: null,
  searchKeyword: "",
  pickupSelection: [],
  pickerMode: "",
  pickerItems: [],
  pickerTempSelected: new Set(),
};

const ROUTE_PLAYBACK_INTERVAL_MS = 140;

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
  if (page !== "pickup") pauseRouteAnimation();
  state.page = page;
  document.querySelectorAll(".page").forEach((el) => el.classList.remove("active"));
  document.querySelectorAll(".nav-button").forEach((el) => el.classList.remove("active"));
  qs(`#${page}Page`).classList.add("active");
  qs(`[data-page="${page}"]`).classList.add("active");
  qs("#pageTitle").textContent = titles[page][0];
  qs("#pageSubtitle").textContent = titles[page][1];
  if (page === "search") {
    searchBooks({ record: false });
    loadRecommendations();
  }
  if (page === "pickup") loadPickup();
  if (page === "profile") loadProfile();
}

function bookCard(book, options = {}) {
  const keyword = options.highlight || "";
  const snippet = descriptionSnippet(book.description, keyword);
  const canToggleFavorite = options.favoriteToggle;
  const isFavorite = Boolean(book.is_favorite);
  const favoriteButton = isFavorite
    ? `<button class="favorite-button active" data-fav-toggle="${book.id}" data-favorite="true">已收藏</button>`
    : `<button class="favorite-button" data-fav-toggle="${book.id}" data-favorite="false">收藏</button>`;
  const div = document.createElement("article");
  div.className = "book-card";
  div.innerHTML = `
    <h3>${highlightText(book.title, keyword)}</h3>
    <div class="book-meta">
      ${highlightText(book.author || "Unknown", keyword)} · <span class="tag">${highlightText(book.category || "未分类", keyword)}</span><br>
      书架 ${book.shelf_id} / 第 ${book.shelf_slot} 位 · 坐标 (${book.row}, ${book.col})
      ${book.match_score ? `<br>匹配度：${book.match_score}` : ""}
      ${snippet ? `<br><span class="snippet">简介：${snippet}</span>` : ""}
      ${book.reason ? `<br>推荐原因：${escapeHtml(book.reason)}` : ""}
    </div>
    <div class="book-actions">
      <span class="book-meta">${escapeHtml(book.status || "available")}</span>
      ${canToggleFavorite ? favoriteButton : ""}
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

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function highlightText(value, keyword) {
  const text = escapeHtml(value);
  const term = String(keyword || "").trim();
  if (!term) return text;
  const pattern = new RegExp(`(${escapeRegExp(escapeHtml(term))})`, "gi");
  return text.replace(pattern, "<mark>$1</mark>");
}

function descriptionSnippet(description, keyword) {
  const raw = String(description || "").trim();
  const term = String(keyword || "").trim();
  if (!raw || !term) return "";
  const index = raw.toLowerCase().indexOf(term.toLowerCase());
  if (index < 0) return "";
  const start = Math.max(0, index - 45);
  const end = Math.min(raw.length, index + term.length + 75);
  const prefix = start > 0 ? "..." : "";
  const suffix = end < raw.length ? "..." : "";
  return `${prefix}${highlightText(raw.slice(start, end), term)}${suffix}`;
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

async function searchBooks(options = {}) {
  const record = options.record !== false;
  const keyword = qs("#searchInput").value.trim();
  state.searchKeyword = keyword;
  const books = await api(`/api/books/search?keyword=${encodeURIComponent(keyword)}&record=${record ? "1" : "0"}`);
  const list = qs("#bookResults");
  list.innerHTML = "";
  books.forEach((book) => list.appendChild(bookCard(book, { favoriteToggle: true, highlight: keyword })));
  qs("#resultCount").textContent = `${books.length} 本`;
  loadRecommendations();
}

async function loadRecommendations() {
  const books = await api("/api/books/recommendations?limit=10");
  const list = qs("#recommendations");
  list.innerHTML = "";
  books.forEach((book) => list.appendChild(bookCard(book, { favoriteToggle: true })));
}

async function toggleFavorite(bookId, isFavorite) {
  if (!state.token) {
    setPage("login");
    return;
  }
  if (isFavorite) {
    await api(`/api/books/${bookId}/favorite`, { method: "DELETE" });
  } else {
    await api(`/api/books/${bookId}/favorite`, { method: "POST", body: "{}" });
  }
  if (state.page === "search") await searchBooks({ record: false });
  if (state.page === "pickup") await loadPickup();
  if (state.page === "profile") await loadProfile();
  await loadRecommendations();
}

async function unfavoriteBook(bookId) {
  await api(`/api/books/${bookId}/favorite`, { method: "DELETE" });
  await searchBooks({ record: false });
  await loadRecommendations();
  if (state.page === "pickup") loadPickup();
  if (state.page === "profile") loadProfile();
}

async function loadPickup() {
  resetRouteAnimation();
  if (!state.token) {
    qs("#pickupSelection").innerHTML = `<div class="profile-card">请先登录，再创建本次取书任务。</div>`;
    qs("#pickupCount").textContent = "0 本";
    return;
  }
  const map = await api("/api/library-map");
  state.map = map;
  renderPickupSelection();
  renderMap();
}

function selectedPickupIds() {
  return new Set(state.pickupSelection.map((book) => Number(book.id)));
}

function renderPickupSelection() {
  const box = qs("#pickupSelection");
  box.innerHTML = "";
  qs("#pickupCount").textContent = `${state.pickupSelection.length} 本`;
  if (!state.pickupSelection.length) {
    box.innerHTML = `<div class="profile-card">还没有选择图书。可以从“我的收藏”或“搜索想看的书”加入本次取书。</div>`;
    qs("#selectionNote").textContent = "Planning / CSP 建议一次选择不超过 10 本，Greedy 可处理更多书。";
    return;
  }

  state.pickupSelection.forEach((book, index) => {
    const item = document.createElement("article");
    item.className = "selected-book";
    item.innerHTML = `
      <span class="selection-index">${index + 1}</span>
      <span>
        <strong>${escapeHtml(book.title)}</strong>
        <br><span class="book-meta">${escapeHtml(book.author || "Unknown")} · ${escapeHtml(book.category || "未分类")} · ${escapeHtml(book.shelf_id)} (${book.row}, ${book.col})</span>
      </span>
      <button data-remove-pickup="${book.id}" aria-label="移除 ${escapeHtml(book.title)}">移除</button>
    `;
    box.appendChild(item);
  });

  const overLimit = state.pickupSelection.length > 10;
  qs("#selectionNote").textContent = overLimit
    ? `已选择 ${state.pickupSelection.length} 本。Greedy 可继续使用，Planning / CSP 最多支持 10 本。`
    : "Planning / CSP 建议一次选择不超过 10 本，Greedy 可处理更多书。";
}

function resetPlannedRoute() {
  pauseRouteAnimation();
  state.path = [];
  state.targets = [];
  state.segments = [];
  state.activeSegment = null;
  state.playbackIndex = null;
  renderRouteSteps();
  renderMap();
  updateRouteProgress();
}

function removePickupBook(bookId) {
  state.pickupSelection = state.pickupSelection.filter((book) => Number(book.id) !== Number(bookId));
  resetPlannedRoute();
  renderPickupSelection();
}

function clearPickupSelection() {
  state.pickupSelection = [];
  resetPlannedRoute();
  renderPickupSelection();
}

function openPicker(mode, items = []) {
  state.pickerMode = mode;
  state.pickerItems = items;
  state.pickerTempSelected = selectedPickupIds();
  qs("#bookPickerModal").hidden = false;
  qs("#bookPickerTitle").textContent = mode === "favorites" ? "我的收藏" : "搜索想看的书";
  qs("#bookPickerSubtitle").textContent = mode === "favorites"
    ? "从收藏中勾选本次要取的书。"
    : "搜索结果可以直接加入本次取书，不需要先收藏。";
  qs("#pickerSearchBar").style.display = mode === "search" ? "grid" : "none";
  qs("#pickerSearchInput").value = "";
  renderPickerList();
}

function closePicker() {
  qs("#bookPickerModal").hidden = true;
  state.pickerItems = [];
  state.pickerTempSelected = new Set();
}

async function openFavoritesPicker() {
  if (!state.token) {
    setPage("login");
    return;
  }
  const favorites = await api("/api/favorites");
  openPicker("favorites", favorites);
}

async function openSearchPicker() {
  if (!state.token) {
    setPage("login");
    return;
  }
  openPicker("search", []);
  qs("#pickerSearchInput").focus();
}

async function searchPickerBooks() {
  const keyword = qs("#pickerSearchInput").value.trim();
  state.pickerItems = await api(`/api/books/search?keyword=${encodeURIComponent(keyword)}&record=0`);
  renderPickerList();
}

function renderPickerList() {
  const list = qs("#pickerList");
  const selected = state.pickerTempSelected;
  list.innerHTML = "";
  qs("#pickerStatus").textContent = `${state.pickerItems.length} 本可选，已勾选 ${selected.size} 本`;
  qs("#pickerSelectAll").checked = state.pickerItems.length > 0 && state.pickerItems.every((book) => selected.has(Number(book.id)));

  if (!state.pickerItems.length) {
    list.innerHTML = `<div class="profile-card">${state.pickerMode === "search" ? "输入关键词后搜索图书。" : "还没有收藏图书。"}</div>`;
    return;
  }

  const alreadySelected = selectedPickupIds();
  state.pickerItems.forEach((book) => {
    const checked = selected.has(Number(book.id));
    const item = document.createElement("label");
    item.className = "picker-item";
    item.innerHTML = `
      <input type="checkbox" value="${book.id}" ${checked ? "checked" : ""}>
      <span>
        <strong>${escapeHtml(book.title)}</strong>
        <br><span class="book-meta">${escapeHtml(book.author || "Unknown")} · ${escapeHtml(book.category || "未分类")} · 书架 ${escapeHtml(book.shelf_id)} / 坐标 (${book.row}, ${book.col})</span>
      </span>
      ${alreadySelected.has(Number(book.id)) ? `<em>已在篮中</em>` : ""}
    `;
    list.appendChild(item);
  });
}

function togglePickerItem(bookId, checked) {
  const id = Number(bookId);
  if (checked) state.pickerTempSelected.add(id);
  else state.pickerTempSelected.delete(id);
  renderPickerList();
}

function togglePickerSelectAll(checked) {
  state.pickerItems.forEach((book) => {
    const id = Number(book.id);
    if (checked) state.pickerTempSelected.add(id);
    else state.pickerTempSelected.delete(id);
  });
  renderPickerList();
}

function confirmPickerSelection() {
  const byId = new Map(state.pickupSelection.map((book) => [Number(book.id), book]));
  state.pickerItems.forEach((book) => {
    const id = Number(book.id);
    if (state.pickerTempSelected.has(id)) byId.set(id, book);
  });
  state.pickupSelection = [...byId.values()];
  resetPlannedRoute();
  renderPickupSelection();
  closePicker();
}

function getVisibleRoutePath() {
  return state.activeSegment == null
    ? state.path
    : state.segments[state.activeSegment]?.path || [];
}

function getAnimatedPath() {
  const path = getVisibleRoutePath();
  if (!path.length || state.playbackIndex == null) return path;
  return path.slice(0, Math.min(state.playbackIndex, path.length - 1) + 1);
}

function getCurrentPlaybackPoint() {
  const path = getVisibleRoutePath();
  if (!path.length || state.playbackIndex == null) return null;
  return path[Math.min(state.playbackIndex, path.length - 1)];
}

function renderMap() {
  if (!state.map) return;
  const visiblePath = getAnimatedPath();
  const pathSet = new Set(visiblePath.map((p) => `${p[0]},${p[1]}`));
  const currentPoint = getCurrentPlaybackPoint();
  const currentKey = currentPoint ? `${currentPoint[0]},${currentPoint[1]}` : "";
  const currentCellClass = "cell current";
  const targetByCell = new Map();
  state.targets.forEach((target, index) => {
    targetByCell.set(`${target.row},${target.col}`, index + 1);
  });
  const grid = qs("#libraryGrid");
  grid.innerHTML = "";
  for (let r = 0; r < state.map.size; r++) {
    for (let c = 0; c < state.map.size; c++) {
      const cell = document.createElement("button");
      const value = state.map.grid[r][c];
      cell.className = "cell";
      if (value === 1) cell.classList.add("shelf");
      if (value === 2) cell.classList.add("entrance");
      if (value === 3) cell.classList.add("exit");
      if (pathSet.has(`${r},${c}`) && value !== 2 && value !== 3) cell.className = "cell path";
      if (targetByCell.has(`${r},${c}`)) {
        cell.className = "cell target";
        cell.textContent = targetByCell.get(`${r},${c}`);
      }
      if (`${r},${c}` === currentKey) {
        cell.className = targetByCell.has(currentKey) ? `${cell.className} current` : currentCellClass;
        if (!targetByCell.has(currentKey)) cell.textContent = "●";
      }
      cell.title = `(${r}, ${c})`;
      grid.appendChild(cell);
    }
  }
}

function updateRouteProgress() {
  const path = getVisibleRoutePath();
  const progress = qs("#routeProgress");
  const playButton = qs("#playRouteButton");
  const pauseButton = qs("#pauseRouteButton");
  const resetButton = qs("#resetRouteButton");
  if (!progress || !playButton || !pauseButton || !resetButton) return;

  const hasPath = path.length > 0;
  const isPlaying = Boolean(state.playbackTimer);
  const frame = state.playbackIndex == null ? null : Math.min(state.playbackIndex, Math.max(path.length - 1, 0));

  if (!hasPath) {
    progress.textContent = "尚未生成路径";
  } else if (frame == null) {
    progress.textContent = `完整路径：${path.length} 格`;
  } else {
    const point = path[frame];
    progress.textContent = `第 ${frame + 1} / ${path.length} 格：(${point[0]}, ${point[1]})`;
  }

  playButton.disabled = !hasPath || isPlaying;
  pauseButton.disabled = !isPlaying;
  resetButton.disabled = !hasPath;
}

function pauseRouteAnimation() {
  if (state.playbackTimer) {
    clearInterval(state.playbackTimer);
    state.playbackTimer = null;
  }
  updateRouteProgress();
}

function resetRouteAnimation() {
  pauseRouteAnimation();
  state.playbackIndex = null;
  renderMap();
  updateRouteProgress();
}

function advanceRouteAnimation() {
  const path = getVisibleRoutePath();
  if (!path.length) {
    resetRouteAnimation();
    return;
  }
  if (state.playbackIndex == null) state.playbackIndex = 0;
  if (state.playbackIndex >= path.length - 1) {
    pauseRouteAnimation();
    return;
  }
  state.playbackIndex += 1;
  renderMap();
  updateRouteProgress();
}

function playRouteAnimation() {
  const path = getVisibleRoutePath();
  if (!path.length || state.playbackTimer) return;
  if (state.playbackIndex == null || state.playbackIndex >= path.length - 1) {
    state.playbackIndex = 0;
  }
  renderMap();
  state.playbackTimer = setInterval(advanceRouteAnimation, ROUTE_PLAYBACK_INTERVAL_MS);
  updateRouteProgress();
}

function renderRouteSteps() {
  const box = qs("#routeSteps");
  box.innerHTML = "";
  if (!state.segments.length) return;

  const heading = document.createElement("div");
  heading.className = "section-title route-heading";
  heading.innerHTML = `<h2>取书步骤</h2><span>点击步骤高亮该段</span>`;
  box.appendChild(heading);

  state.segments.forEach((segment, index) => {
    const item = document.createElement("button");
    item.className = `route-step ${state.activeSegment === index ? "active" : ""}`;
    item.dataset.segment = index;
    const directions = segment.instructions?.length ? segment.instructions.join("，") : "无需移动";
    const title = segment.type === "exit"
      ? `步骤 ${index + 1} · 前往出口`
      : `步骤 ${index + 1} · 取 ${escapeHtml(segment.shelfId)}`;
    const bookLine = segment.type === "book"
      ? `<strong>${escapeHtml(segment.bookTitle)}</strong><br><span>${escapeHtml(segment.pickupSide)}取书</span>`
      : `<strong>到达出口</strong><br><span>完成本次取书</span>`;
    item.innerHTML = `
      <div class="route-step-title">${title}</div>
      <div class="route-step-body">
        ${bookLine}
        <span>距离：${segment.distance} 步</span>
        <span>方向：${escapeHtml(directions)}</span>
      </div>
    `;
    box.appendChild(item);
  });
}

async function planPath() {
  const ids = state.pickupSelection.map((book) => Number(book.id));
  if (!ids.length) {
    qs("#pathMetrics").textContent = "请至少选择一本想取的书。";
    return;
  }
  const algorithm = qs("#algorithmSelect").value;
  const method = qs("#solverSelect")?.value || "greedy";
  pauseRouteAnimation();
  let result;
  try {
    result = await api("/api/pickup/solve", {
      method: "POST",
      body: JSON.stringify({ bookIds: ids, algorithm, method }),
    });
  } catch (err) {
    state.path = [];
    state.targets = [];
    state.segments = [];
    state.activeSegment = null;
    state.playbackIndex = null;
    qs("#pathMetrics").textContent = err.message;
    renderRouteSteps();
    renderMap();
    updateRouteProgress();
    return;
  }
  state.path = result.path || [];
  state.targets = result.visitOrder || [];
  state.segments = result.segments || [];
  state.activeSegment = null;
  state.playbackIndex = null;
  qs("#pathMetrics").innerHTML = `
    <strong>算法指标</strong><br>
    求解方式：${escapeHtml(String(result.method || method).toUpperCase())}<br>
    策略：${result.algorithm.toUpperCase()}<br>
    扩展节点：${result.expanded}<br>
    运行时间：${result.runtimeMs} ms<br>
    ${result.solverExpanded != null ? `组合求解扩展：${result.solverExpanded}<br>` : ""}
    ${result.precomputeExpanded != null ? `两点最短路扩展：${result.precomputeExpanded}<br>` : ""}
    <br>
    <strong>路线摘要</strong><br>
    共需取书：${result.visitOrder.length} 本<br>
    总路程：${result.distance} 步<br>
    推荐顺序：${result.visitOrder.map((b) => escapeHtml(b.shelf_id)).join(" → ")} → 出口
  `;
  renderRouteSteps();
  renderMap();
  updateRouteProgress();
}

async function loadProfile() {
  if (!state.token) {
    qs("#profileInfo").innerHTML = "请先登录。";
    qs("#historyList").innerHTML = "";
    qs("#profileFavorites").innerHTML = "";
    qs("#passwordMessage").textContent = "";
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

async function changePassword() {
  const currentPassword = qs("#currentPassword").value;
  const newPassword = qs("#newPassword").value;
  const confirmPassword = qs("#confirmPassword").value;
  const message = qs("#passwordMessage");

  if (!currentPassword || !newPassword || !confirmPassword) {
    message.textContent = "请填写完整密码信息。";
    return;
  }
  if (newPassword !== confirmPassword) {
    message.textContent = "两次输入的新密码不一致。";
    return;
  }
  try {
    await api("/api/users/me/password", {
      method: "POST",
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    qs("#currentPassword").value = "";
    qs("#newPassword").value = "";
    qs("#confirmPassword").value = "";
    message.textContent = "密码已更新。下次登录请使用新密码。";
  } catch (err) {
    message.textContent = err.message;
  }
}

async function submitAuth() {
  const isRegister = qs("#registerTab").classList.contains("active");
  const username = qs("#authUsername").value.trim();
  const password = qs("#authPassword").value;
  try {
    if (isRegister) {
      const confirm = qs("#authConfirmPassword") ? qs("#authConfirmPassword").value : "";
      if (!username || !password || !confirm) {
        qs("#authMessage").textContent = "请完整填写用户名和密码。";
        return;
      }
      if (password !== confirm) {
        qs("#authMessage").textContent = "两次输入的密码不一致。";
        return;
      }
      if (password.length < 6) {
        qs("#authMessage").textContent = "密码至少需要 6 位。";
        return;
      }
      await api("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({ username, password, confirmPassword: confirm }),
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
    const toggle = event.target.closest("[data-fav-toggle]");
    const unfav = event.target.closest("[data-unfav]");
    const removePickup = event.target.closest("[data-remove-pickup]");
    if (toggle) toggleFavorite(toggle.dataset.favToggle, toggle.dataset.favorite === "true");
    if (unfav) unfavoriteBook(unfav.dataset.unfav);
    if (removePickup) removePickupBook(removePickup.dataset.removePickup);
  });
  qs("#openFavoritesButton").addEventListener("click", openFavoritesPicker);
  qs("#openSearchPickerButton").addEventListener("click", openSearchPicker);
  qs("#clearPickupButton").addEventListener("click", clearPickupSelection);
  qs("#closeBookPicker").addEventListener("click", closePicker);
  qs("#cancelBookPicker").addEventListener("click", closePicker);
  qs("#confirmBookPicker").addEventListener("click", confirmPickerSelection);
  qs("#pickerSearchButton").addEventListener("click", searchPickerBooks);
  qs("#pickerSearchInput").addEventListener("keydown", (event) => {
    if (event.key === "Enter") searchPickerBooks();
  });
  qs("#pickerSelectAll").addEventListener("change", (event) => togglePickerSelectAll(event.target.checked));
  qs("#pickerList").addEventListener("change", (event) => {
    const input = event.target.closest("input[type='checkbox']");
    if (input) togglePickerItem(input.value, input.checked);
  });
  qs("#bookPickerModal").addEventListener("click", (event) => {
    if (event.target.id === "bookPickerModal") closePicker();
  });
  qs("#planButton").addEventListener("click", planPath);
  qs("#playRouteButton").addEventListener("click", playRouteAnimation);
  qs("#pauseRouteButton").addEventListener("click", pauseRouteAnimation);
  qs("#resetRouteButton").addEventListener("click", resetRouteAnimation);
  qs("#routeSteps").addEventListener("click", (event) => {
    const step = event.target.closest("[data-segment]");
    if (!step) return;
    const index = Number(step.dataset.segment);
    pauseRouteAnimation();
    state.activeSegment = state.activeSegment === index ? null : index;
    state.playbackIndex = null;
    renderRouteSteps();
    renderMap();
    updateRouteProgress();
  });
  qs("#authSubmit").addEventListener("click", submitAuth);
  document.querySelectorAll(".toggle-password").forEach((button) => {
    button.addEventListener("click", () => togglePasswordVisibility(button));
  });
  qs("#changePasswordButton").addEventListener("click", changePassword);
  qs("#loginTab").addEventListener("click", () => switchAuth(false));
  qs("#registerTab").addEventListener("click", () => switchAuth(true));
}

function togglePasswordVisibility(button) {
  const input = qs(`#${button.dataset.target}`);
  const showing = input.type === "text";
  input.type = showing ? "password" : "text";
  button.textContent = showing ? "👁" : "🙈";
  button.setAttribute("aria-label", showing ? "显示密码" : "隐藏密码");
  button.title = showing ? "显示密码" : "隐藏密码";
}

function switchAuth(register) {
  qs("#loginTab").classList.toggle("active", !register);
  qs("#registerTab").classList.toggle("active", register);
  qs("#authSubmit").textContent = register ? "注册" : "登录";
  qs("#authMessage").textContent = register ? "创建一个新账号。" : "演示账号：demo / demo123";
  // 显示或隐藏注册专用的确认密码输入
  const confirmLabel = qs("#authConfirmLabel");
  const confirmWrap = qs("#authConfirmWrap");
  if (confirmLabel && confirmWrap) {
    confirmLabel.style.display = register ? "block" : "none";
    confirmWrap.style.display = register ? "block" : "none";
  }
}

async function boot() {
  bindEvents();
  await loadStats();
  await loadMe();
  await searchBooks({ record: false });
  await loadRecommendations();
  updateRouteProgress();
}

boot().catch((err) => {
  document.body.innerHTML = `<pre style="padding:24px">${escapeHtml(err.stack || err.message)}</pre>`;
});
