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
  playbackProgress: null,
  playbackStartedAt: null,
  playbackStartProgress: 0,
  autoPlanEnabled: false,
  autoPlanTimer: null,
  planRequestId: 0,
  compareRequestId: 0,
  searchKeyword: "",
  searchFacets: null,
  pickupSelection: [],
  pickerMode: "",
  pickerItems: [],
  pickerTempSelected: new Set(),
  selectedSeat: null,
  recommendationRequestId: 0,
  recommendationTimer: null,
  latestRouteResult: null,
};

const ROUTE_PLAYBACK_STEP_MS = 90;
const SVG_NS = "http://www.w3.org/2000/svg";
const ROUTE_COLORS = ["#2364aa", "#e4572e", "#0f8b8d", "#8a4fff", "#b7791f", "#00875a", "#c026d3", "#475569"];
const PATH_ALGORITHMS = [
  ["bfs", "BFS"],
  ["ucs", "Uniform Cost Search"],
  ["astar_manhattan", "A* 曼哈顿"],
  ["astar_euclidean", "A* 欧几里得"],
];
const ORDER_ALGORITHMS = [
  ["greedy", "贪心最近邻"],
  ["greedy_2opt", "贪心 + 2-opt"],
];

const titles = {
  login: ["登录 / 注册", ""],
  search: ["图书搜索", ""],
  pickup: ["取书路径规划", ""],
  profile: ["个人中心", ""],
};

function qs(selector) {
  return document.querySelector(selector);
}

function authHeaders() {
  return state.token ? { Authorization: `Bearer ${state.token}` } : {};
}

async function api(path, options = {}) {
  const { timeoutMs, ...requestOptions } = options;
  let timeoutId = null;
  let signal = requestOptions.signal;
  if (timeoutMs) {
    const controller = new AbortController();
    signal = controller.signal;
    timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
  }
  try {
    const response = await fetch(path, {
      ...requestOptions,
      signal,
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(),
        ...(requestOptions.headers || {}),
      },
    });
    let data = {};
    try {
      data = await response.json();
    } catch {
      data = {};
    }
    if (!response.ok) throw new Error(data.error || "请求失败");
    return data;
  } catch (err) {
    if (err.name === "AbortError") throw new Error("请求超时，请稍后重试");
    throw err;
  } finally {
    if (timeoutId) window.clearTimeout(timeoutId);
  }
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
    scheduleRecommendationRefresh();
  }
  if (page === "pickup") loadPickup();
  if (page === "profile") loadProfile();
}

function bookCard(book, options = {}) {
  const keyword = options.highlight || "";
  const useDatasetSummary = Boolean(options.datasetMeta);
  const useDetails = Boolean(options.collapsibleDetails);
  const detailId = `book-details-${book.id}`;
  const canToggleFavorite = options.favoriteToggle;
  const isFavorite = Boolean(book.is_favorite);
  const favoriteButton = isFavorite
    ? `<button class="favorite-button active" data-fav-toggle="${book.id}" data-favorite="true">已收藏</button>`
    : `<button class="favorite-button" data-fav-toggle="${book.id}" data-favorite="false">收藏</button>`;
  const detailsButton = useDetails
    ? `<button class="book-details-toggle" data-book-details-toggle="${detailId}" aria-expanded="false" aria-controls="${detailId}">详情 ▾</button>`
    : "";
  const div = document.createElement("article");
  div.className = "book-card";
  div.innerHTML = `
    <h3>${highlightText(book.title, keyword)}</h3>
    <div class="book-card-summary">
      <div class="book-meta-line">${highlightText(book.author || "Unknown", keyword)} · <span class="tag">${highlightText(book.category || "未分类", keyword)}</span></div>
      ${useDatasetSummary ? bookPublisherLine(book, keyword) : `<div class="book-meta-line">书架 ${escapeHtml(book.shelf_id)} / 第 ${escapeHtml(book.shelf_slot)} 位 · 坐标 (${escapeHtml(book.row)}, ${escapeHtml(book.col)})</div>`}
      ${useDatasetSummary ? bookMetricGrid(book) : ""}
      ${useDatasetSummary ? genrePreview(book.genres, keyword) : ""}
      ${book.similarity_percent !== undefined && book.similarity_percent !== null ? `<br><span class="ml-score">相似度：${book.similarity_percent}%</span>` : ""}
    </div>
    ${useDetails ? bookDetailsPanel(book, keyword, detailId) : ""}
    <div class="book-actions">
      <span class="book-meta">${escapeHtml(book.status || "available")}</span>
      <span class="book-action-buttons">
      ${detailsButton}
      ${canToggleFavorite ? favoriteButton : ""}
      ${options.unfavorite ? `<button data-unfav="${book.id}">取消收藏</button>` : ""}
      </span>
    </div>
  `;
  return div;
}

function bookPublisherLine(book, keyword) {
  const parts = [
    book.publisher ? highlightText(book.publisher, keyword) : "",
    book.publication_year ? escapeHtml(book.publication_year) : "",
  ].filter(Boolean);
  return parts.length ? `<div class="book-meta-line book-publisher-line">${parts.join(" · ")}</div>` : "";
}

function bookMetricGrid(book) {
  const metrics = [
    book.average_rating !== undefined && book.average_rating !== null ? metricItem("Rating", book.average_rating) : "",
    book.ratings_count !== undefined && book.ratings_count !== null ? metricItem("Ratings", formatNumber(book.ratings_count)) : "",
    book.num_pages !== undefined && book.num_pages !== null ? metricItem("Pages", formatNumber(book.num_pages)) : "",
    metricItem("Shelf", `${escapeHtml(book.shelf_id)} · ${escapeHtml(book.shelf_slot)} · (${escapeHtml(book.row)}, ${escapeHtml(book.col)})`),
  ].filter(Boolean);
  return `<div class="book-metrics">${metrics.join("")}</div>`;
}

function metricItem(label, value) {
  return `<span><strong>${escapeHtml(label)}</strong>${value}</span>`;
}

function genrePreview(value, keyword) {
  const chips = genreChips(value, keyword, 5);
  return chips ? `<div class="book-genre-preview">${chips}</div>` : "";
}

function genreChips(value, keyword, limit = 10) {
  const items = String(value || "")
    .split(";")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, limit);
  if (!items.length) return "";
  return `<span class="dataset-chips">${items
    .map((item) => `<span>${highlightText(item, keyword)}</span>`)
    .join("")}</span>`;
}

function bookDetailsPanel(book, keyword, detailId) {
  const rows = [
    book.isbn ? detailRow("ISBN", highlightText(book.isbn, keyword)) : "",
    book.isbn13 ? detailRow("ISBN13", highlightText(book.isbn13, keyword)) : "",
    book.genres ? detailRow("Genres", highlightText(book.genres, keyword)) : "",
    book.match_score ? detailRow("匹配度", escapeHtml(book.match_score)) : "",
  ].filter(Boolean);
  const preview = descriptionPreview(book.description, keyword);
  if (preview) rows.push(detailRow("简介", preview));
  return rows.length ? `<div class="book-card-details" id="${detailId}" hidden>${rows.join("")}</div>` : "";
}

function detailRow(label, value) {
  return `<div class="book-detail-row"><strong>${escapeHtml(label)}</strong><span>${value}</span></div>`;
}

function descriptionPreview(description, keyword) {
  const raw = cleanDescription(description);
  if (!raw) return "";
  const snippet = descriptionSnippet(raw, keyword);
  if (snippet) return snippet;
  const short = raw.length > 220 ? `${raw.slice(0, 220)}...` : raw;
  return escapeHtml(short);
}

function cleanDescription(description) {
  return String(description || "").split(/\n\s*\nPublisher:/)[0].trim();
}

function formatNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return escapeHtml(value);
  return number.toLocaleString("en-US");
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

async function loadSearchFacets() {
  state.searchFacets = await api("/api/books/search-facets");
  populateSelect("#genreFilter", "All genres", state.searchFacets.genres || []);
}

function populateSelect(selector, label, values) {
  const select = qs(selector);
  const current = select.value;
  select.innerHTML = `<option value="">${escapeHtml(label)}</option>`;
  values.forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    select.appendChild(option);
  });
  if (values.includes(current)) select.value = current;
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
  const params = new URLSearchParams(searchFilterParams());
  params.set("keyword", keyword);
  params.set("record", record ? "1" : "0");
  const list = qs("#bookResults");
  list.classList.add("is-loading");
  if (!list.children.length) {
    list.innerHTML = `<div class="skeleton-card"></div><div class="skeleton-card"></div><div class="skeleton-card"></div>`;
  }
  try {
    const books = await api(`/api/books/search?${params.toString()}`, { timeoutMs: 20000 });
    list.innerHTML = "";
    if (!books.length) {
      list.innerHTML = `<div class="state-card"><strong>没有找到匹配图书</strong>调整关键词或筛选条件后再试。</div>`;
    } else {
      books.forEach((book) => list.appendChild(bookCard(book, { favoriteToggle: true, highlight: keyword, datasetMeta: true, collapsibleDetails: true })));
    }
    qs("#resultCount").textContent = `${books.length} 本`;
    if (options.refreshRecommendations || record) scheduleRecommendationRefresh();
  } catch (err) {
    list.innerHTML = `<div class="state-card warning"><strong>搜索暂时不可用</strong>${escapeHtml(err.message)}</div>`;
    qs("#resultCount").textContent = "加载失败";
  } finally {
    list.classList.remove("is-loading");
  }
}

function searchFilterParams() {
  const pairs = {
    genre: qs("#genreFilter").value,
    publisher: qs("#publisherFilter").value.trim(),
    yearFrom: nonDefaultFilterValue("#yearFromFilter"),
    yearTo: nonDefaultFilterValue("#yearToFilter"),
    minRating: nonDefaultFilterValue("#minRatingFilter"),
    minRatingsCount: nonDefaultFilterValue("#minRatingsCountFilter"),
  };
  return Object.fromEntries(Object.entries(pairs).filter(([, value]) => value !== ""));
}

function nonDefaultFilterValue(selector) {
  const input = qs(selector);
  const value = input.value.trim();
  return value === (input.dataset.defaultValue || "") ? "" : value;
}

function resetSearchFilters() {
  ["#genreFilter"].forEach((selector) => {
    qs(selector).value = "";
  });
  ["#publisherFilter"].forEach((selector) => {
    qs(selector).value = "";
  });
  ["#yearFromFilter", "#yearToFilter", "#minRatingFilter", "#minRatingsCountFilter"].forEach((selector) => {
    const input = qs(selector);
    input.value = input.dataset.defaultValue || "";
  });
  searchBooks({ record: false });
}

function scheduleRecommendationRefresh(delay = 160) {
  window.clearTimeout(state.recommendationTimer);
  state.recommendationTimer = window.setTimeout(() => {
    state.recommendationTimer = null;
    loadRecommendations();
  }, delay);
}

async function loadRecommendations() {
  const requestId = ++state.recommendationRequestId;
  const list = qs("#recommendations");
  const profile = qs("#mlProfile");
  list.innerHTML = `<div class="skeleton-card"></div><div class="skeleton-card"></div>`;
  profile.classList.add("is-loading");
  profile.innerHTML = `<div class="ml-summary">正在生成推荐结果...</div>`;
  try {
    const data = await api("/api/books/recommendations?limit=10&analysis=1", { timeoutMs: 12000 });
    if (requestId !== state.recommendationRequestId) return;
    const keywords = data.profileKeywords || [];
    const profileGenres = data.preferredGenres || [];
    const modelStatus = data.modelStatus || {};
    const modelStatusNote = modelStatus.available
      ? ""
      : String(modelStatus.reason || "").startsWith("load_failed")
        ? "模型加载失败，已切换为热门推荐"
        : "未训练也可使用，当前展示热门高评分推荐";
    profile.innerHTML = `
      ${data.summary ? `<div class="ml-summary">${escapeHtml(data.summary)}</div>` : ""}
      <div class="ml-weights">
        <span>模型 <strong>${modelStatus.available ? "已加载" : "未训练"}</strong></span>
        ${modelStatus.embeddingDim ? `<span>Embedding <strong>${escapeHtml(modelStatus.embeddingDim)}</strong></span>` : ""}
        ${modelStatus.interactionCount ? `<span>交互 <strong>${formatNumber(modelStatus.interactionCount)}</strong></span>` : ""}
      </div>
      ${modelStatusNote ? `<div class="ml-summary">${escapeHtml(modelStatusNote)}</div>` : ""}
      <div class="ml-keywords">
        ${keywords.length
          ? keywords.map((item) => `<span>${escapeHtml(item.term)}</span>`).join("")
          : `<span>${state.token ? "暂无用户画像关键词" : "登录后生成用户画像"}</span>`}
      </div>
      <div class="ml-keywords profile-genres">
        ${profileGenres.length
          ? profileGenres.map((item) => `<span>${escapeHtml(item.genre)} <strong>${item.weight}</strong></span>`).join("")
          : ""}
      </div>
    `;
    list.innerHTML = "";
    const books = data.books || [];
    if (!books.length) {
      list.innerHTML = `<div class="state-card"><strong>暂无推荐</strong>搜索或收藏几本书后会生成更准确的结果。</div>`;
    } else {
      books.forEach((book) => list.appendChild(bookCard(book, { favoriteToggle: true })));
    }
  } catch (err) {
    if (requestId !== state.recommendationRequestId) return;
    profile.innerHTML = `<div class="state-card warning"><strong>推荐暂时不可用</strong>搜索和取书功能仍可正常使用。</div>`;
    list.innerHTML = `<div class="state-card warning"><strong>无法加载推荐</strong>${escapeHtml(err.message)}</div>`;
  } finally {
    if (requestId === state.recommendationRequestId) profile.classList.remove("is-loading");
  }
}

function setFavoriteButtonsState(bookId, isFavorite, disabled = false) {
  document.querySelectorAll(`[data-fav-toggle="${bookId}"]`).forEach((button) => {
    button.dataset.favorite = isFavorite ? "true" : "false";
    button.classList.toggle("active", isFavorite);
    button.textContent = isFavorite ? "已收藏" : "收藏";
    button.disabled = disabled;
  });
}

async function toggleFavorite(bookId, isFavorite) {
  if (!state.token) {
    setPage("login");
    return;
  }
  const nextState = !isFavorite;
  setFavoriteButtonsState(bookId, nextState, true);
  try {
    if (isFavorite) {
      await api(`/api/books/${bookId}/favorite`, { method: "DELETE" });
    } else {
      await api(`/api/books/${bookId}/favorite`, { method: "POST", body: "{}" });
    }
    setFavoriteButtonsState(bookId, nextState, false);
    if (state.page === "pickup") await loadPickup();
    if (state.page === "profile") await loadProfile();
    scheduleRecommendationRefresh();
  } catch (err) {
    setFavoriteButtonsState(bookId, isFavorite, false);
    openNotice(err.message, "收藏失败");
  }
}

async function unfavoriteBook(bookId) {
  setFavoriteButtonsState(bookId, false, true);
  try {
    await api(`/api/books/${bookId}/favorite`, { method: "DELETE" });
    setFavoriteButtonsState(bookId, false, false);
    scheduleRecommendationRefresh();
    if (state.page === "pickup") loadPickup();
    if (state.page === "profile") loadProfile();
  } catch (err) {
    setFavoriteButtonsState(bookId, true, false);
    openNotice(err.message, "取消收藏失败");
  }
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
  qs("#mapShelfCount").textContent = `${map.shelves.length} 个书架`;
  renderPickupSelection();
  renderSelectedSeat();
  renderRouteSteps();
  syncAlgorithmOptions("algorithmSelect");
  syncAlgorithmOptions("solverSelect");
  renderCspMetrics();
  renderMap();
}

function renderSelectedSeat() {
  const box = qs("#selectedSeatInfo");
  if (!box) return;
  if (!state.selectedSeat) {
    box.textContent = "终点座位：无";
    return;
  }
  const [row, col] = state.selectedSeat;
  box.textContent = `终点座位：阅读区 (${row}, ${col})`;
}

function resetPathMetrics(message = "等待生成路径") {
  const box = qs("#pathMetrics");
  if (!box) return;
  box.classList.add("analysis-empty");
  box.innerHTML = `
    <strong>${escapeHtml(message)}</strong>
  `;
}

function selectedOptionText(selector, fallback) {
  const element = qs(selector);
  return element?.selectedOptions?.[0]?.textContent || fallback;
}

function constraintsEnabled() {
  return Boolean(qs("#constraintsToggle")?.checked);
}

function constraintMetricsRows(result) {
  if (!result?.constraintsEnabled || !result.constraintStats) return "";
  const stats = result.constraintStats;
  const allowed = stats.allowedCells ?? 0;
  const original = stats.originalCells ?? 0;
  return `
      <div class="metric-row"><span>CSP 可搜索格</span><strong>${allowed} / ${original}</strong></div>
      <div class="metric-row"><span>CSP 剪枝格</span><strong>${stats.prunedCells ?? 0}</strong></div>
      <div class="metric-row"><span>CSP 回退段</span><strong>${stats.fallbackSegments ?? 0}</strong></div>
      <div class="metric-row"><span>CSP 预处理</span><strong>${stats.cspRuntimeMs ?? 0} ms</strong></div>
    `;
}

function renderCspMetrics(result = state.latestRouteResult) {
  const box = qs("#cspMetrics");
  if (!box) return;
  const rows = constraintMetricsRows(result);
  if (rows) {
    box.classList.remove("analysis-empty");
    box.innerHTML = `<section class="analysis-group">${rows}</section>`;
    return;
  }
  box.classList.add("analysis-empty");
  box.innerHTML = `<strong>${constraintsEnabled() ? "生成路径后显示 CSP 指标" : "开启 CSP 后生成路径"}</strong>`;
}

function syncAlgorithmOptions(selectId) {
  const select = qs(`#${selectId}`);
  const group = qs(`[data-algorithm-group="${selectId}"]`);
  if (!select || !group) return;
  group.querySelectorAll(".algorithm-option").forEach((button) => {
    button.classList.toggle("active", button.dataset.value === select.value);
  });
}

function setAlgorithmSelection(selectId, value) {
  const select = qs(`#${selectId}`);
  if (!select || select.value === value) return;
  select.value = value;
  syncAlgorithmOptions(selectId);
  markRouteSettingsChanged();
}

function toggleWorkbenchTool(panelId) {
  const panel = qs(`#${panelId}`);
  if (!panel) return;
  const shouldOpen = panel.classList.contains("collapsed");
  document.querySelectorAll(".floating-tool-panel").forEach((item) => {
    item.classList.toggle("collapsed", item.id !== panelId || !shouldOpen);
  });
  document.querySelectorAll("[data-tool-toggle]").forEach((button) => {
    const active = button.dataset.toolToggle === panelId && shouldOpen;
    button.classList.toggle("active", active);
    button.setAttribute("aria-expanded", String(active));
  });
  requestAnimationFrame(renderMap);
}

function setWorkbenchView(view) {
  const workbench = qs(".pickup-workbench");
  if (!workbench) return;
  workbench.dataset.mobileView = view;
  document.querySelectorAll("[data-workbench-view]").forEach((button) => {
    const active = button.dataset.workbenchView === view;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
  });
  requestAnimationFrame(renderMap);
}

function scheduleAutoPlan() {
  if (!state.autoPlanEnabled) return;
  window.clearTimeout(state.autoPlanTimer);
  state.autoPlanTimer = window.setTimeout(() => {
    state.autoPlanTimer = null;
    planPath({ automatic: true });
  }, 220);
}

function markRouteSettingsChanged() {
  window.clearTimeout(state.autoPlanTimer);
  state.planRequestId += 1;
  resetPlannedRoute();
  resetPathMetrics();
  scheduleAutoPlan();
}

function selectedPickupIds() {
  return new Set(state.pickupSelection.map((book) => Number(book.id)));
}

function renderPickupSelection() {
  const box = qs("#pickupSelection");
  box.innerHTML = "";
  qs("#pickupCount").textContent = `${state.pickupSelection.length} 本`;

  state.pickupSelection.forEach((book, index) => {
    const item = document.createElement("article");
    item.className = "selected-book";
    item.innerHTML = `
      <span class="selection-index">${index + 1}</span>
      <span class="selected-book-body">
        <strong>${escapeHtml(book.title)}</strong>
        <br><span class="book-meta">${escapeHtml(book.author || "Unknown")} · ${escapeHtml(book.category || "未分类")} · ${escapeHtml(book.shelf_id)} (${book.row}, ${book.col})</span>
      </span>
      <button class="remove-selected-book" data-remove-pickup="${book.id}" aria-label="移除 ${escapeHtml(book.title)}" title="移除">×</button>
    `;
    box.appendChild(item);
  });

  if (!state.pickupSelection.length) {
    box.innerHTML = `
      <div class="pickup-empty-hint">点击右上角“+”添加想取的书</div>
    `;
  }
}

function toggleAddBookMenu() {
  const menu = qs("#addBookMenu");
  const shouldOpen = menu.hidden;
  menu.hidden = !shouldOpen;
  if (shouldOpen) positionAddBookMenu();
}

function closeAddBookMenu() {
  qs("#addBookMenu").hidden = true;
}

function openNotice(message = "需要点击绿色格子来确定最终座位。", title = "提示") {
  qs("#noticeTitle").textContent = title;
  qs("#noticeMessage").textContent = message;
  qs("#noticeModal").hidden = false;
}

function closeNotice() {
  qs("#noticeModal").hidden = true;
}

function positionAddBookMenu() {
  const menu = qs("#addBookMenu");
  const button = qs("#addPickupBookButton");
  const panel = qs(".pickup-panel");
  if (!menu || !button || !panel) return;
  const buttonRect = button.getBoundingClientRect();
  const panelRect = panel.getBoundingClientRect();
  const menuWidth = 180;
  menu.style.left = `${buttonRect.right - panelRect.left - menuWidth}px`;
  menu.style.top = `${buttonRect.bottom - panelRect.top + 6}px`;
  menu.style.width = `${menuWidth}px`;
}

function resetPlannedRoute() {
  pauseRouteAnimation();
  state.path = [];
  state.targets = [];
  state.segments = [];
  state.activeSegment = null;
  state.playbackProgress = null;
  state.playbackStartedAt = null;
  state.playbackStartProgress = 0;
  state.latestRouteResult = null;
  renderRouteSteps();
  renderCspMetrics();
  renderMap();
  updateRouteProgress();
}

function removePickupBook(bookId) {
  state.pickupSelection = state.pickupSelection.filter((book) => Number(book.id) !== Number(bookId));
  renderPickupSelection();
  markRouteSettingsChanged();
}

function clearPickupSelection() {
  state.pickupSelection = [];
  renderPickupSelection();
  markRouteSettingsChanged();
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
  state.pickerItems = await api(`/api/books/search?keyword=${encodeURIComponent(keyword)}&record=1`);
  renderPickerList();
}

function renderPickerList() {
  const list = qs("#pickerList");
  const selected = state.pickerTempSelected;
  const selectedInCurrentList = state.pickerItems.filter((book) => selected.has(Number(book.id))).length;
  list.innerHTML = "";
  qs("#pickerStatus").textContent = `${state.pickerItems.length} 本可选，已勾选 ${selectedInCurrentList} 本`;
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
  renderPickupSelection();
  closePicker();
  markRouteSettingsChanged();
}

function getVisibleRoutePath() {
  return state.activeSegment == null
    ? state.path
    : state.segments[state.activeSegment]?.path || [];
}

function getPlaybackLimit() {
  const path = getVisibleRoutePath();
  return Math.max(0, path.length - 1);
}

function getVisibleProgress() {
  const path = getVisibleRoutePath();
  if (!path.length || state.playbackProgress == null) return path.length ? path.length - 1 : 0;
  return Math.min(state.playbackProgress, getPlaybackLimit());
}

function routePointKey(point) {
  return `${point[0]},${point[1]}`;
}

function cellCenter(grid, point) {
  const cell = grid.querySelector(`[data-row="${point[0]}"][data-col="${point[1]}"]`);
  if (!cell) return null;
  const cellRect = cell.getBoundingClientRect();
  const gridRect = grid.getBoundingClientRect();
  return {
    x: cellRect.left - gridRect.left + cellRect.width / 2,
    y: cellRect.top - gridRect.top + cellRect.height / 2,
  };
}

function routeVisualPoints(grid, path, segmentIndex) {
  const usage = sharedRouteEdgeUsage();
  const points = [];
  const runs = routeRuns(path).map((run) => {
    const startCenter = cellCenter(grid, path[run.start]);
    const endCenter = cellCenter(grid, path[run.end]);
    const offset = routeRunOffset(path, run, segmentIndex, usage);
    return {
      run,
      startCenter,
      endCenter,
      offset,
      start: startCenter ? { x: startCenter.x + offset.x, y: startCenter.y + offset.y } : null,
      end: endCenter ? { x: endCenter.x + offset.x, y: endCenter.y + offset.y } : null,
    };
  }).filter((item) => item.startCenter && item.endCenter && item.start && item.end);

  runs.forEach((item, runIndex) => {
    const next = runs[runIndex + 1];

    if (!points.length) {
      points.push(item.startCenter);
      if (!sameVisualPoint(item.startCenter, item.start)) points.push(item.start);
    }

    const endPoint = next ? routeCornerJoin(item, next) : item.end;
    if (!sameVisualPoint(points[points.length - 1], endPoint)) {
      points.push(endPoint);
    }
  });

  return points;
}

function routeCornerJoin(previous, current) {
  const center = previous.endCenter;
  return {
    x: center.x + routeAxisOffset(previous, current, "x"),
    y: center.y + routeAxisOffset(previous, current, "y"),
  };
}

function routeAxisOffset(previous, current, axis) {
  const candidates = [previous, current];
  const matching = candidates.find((item) => {
    const vertical = Math.abs(item.run.direction[0]) > 0;
    return axis === "x" ? vertical : !vertical;
  });
  return matching ? matching.offset[axis] : 0;
}

function routeRuns(path) {
  if (path.length < 2) return [];
  const runs = [];
  let start = 0;
  let direction = routeDirection(path[0], path[1]);

  for (let index = 1; index < path.length - 1; index += 1) {
    const nextDirection = routeDirection(path[index], path[index + 1]);
    if (nextDirection[0] !== direction[0] || nextDirection[1] !== direction[1]) {
      runs.push({ start, end: index, direction });
      start = index;
      direction = nextDirection;
    }
  }
  runs.push({ start, end: path.length - 1, direction });
  return runs;
}

function routeDirection(from, to) {
  return [Math.sign(to[0] - from[0]), Math.sign(to[1] - from[1])];
}

function canonicalEdgeKey(a, b) {
  return [routePointKey(a), routePointKey(b)].sort().join("|");
}

function sharedRouteEdgeUsage() {
  const usage = new Map();
  state.segments.forEach((segment, segmentIndex) => {
    (segment.path || []).slice(1).forEach((point, index) => {
      const previous = segment.path[index];
      const key = canonicalEdgeKey(previous, point);
      if (!usage.has(key)) usage.set(key, new Set());
      usage.get(key).add(segmentIndex);
    });
  });
  return usage;
}

function sameVisualPoint(left, right) {
  return Math.abs(left.x - right.x) < 0.1 && Math.abs(left.y - right.y) < 0.1;
}

function routeRunOffset(path, run, segmentIndex, usage) {
  const peerSet = new Set([segmentIndex]);
  for (let index = run.start; index < run.end; index += 1) {
    const peers = usage.get(canonicalEdgeKey(path[index], path[index + 1])) || [];
    peers.forEach((peer) => peerSet.add(peer));
  }
  const peers = [...peerSet].sort((a, b) => a - b);
  if (peers.length <= 1) return { x: 0, y: 0 };

  const order = peers.indexOf(segmentIndex);
  const centered = order - (peers.length - 1) / 2;
  const amount = centered * 4;
  const direction = run.direction;

  if (Math.abs(direction[1]) > Math.abs(direction[0])) return { x: 0, y: amount };
  return { x: amount, y: 0 };
}

function segmentStepRanges() {
  let cursor = 0;
  return state.segments.map((segment) => {
    const stepCount = Math.max(0, (segment.path || []).length - 1);
    const range = { start: cursor, end: cursor + stepCount };
    cursor += stepCount;
    return range;
  });
}

function progressForSegment(index) {
  const segment = state.segments[index];
  const segmentLimit = Math.max(0, (segment?.path || []).length - 1);
  if (state.playbackProgress == null) return segmentLimit;
  if (state.activeSegment != null) {
    return state.activeSegment === index ? Math.min(state.playbackProgress, segmentLimit) : segmentLimit;
  }

  const range = segmentStepRanges()[index];
  if (!range) return segmentLimit;
  if (state.playbackProgress <= range.start) return 0;
  if (state.playbackProgress >= range.end) return segmentLimit;
  return state.playbackProgress - range.start;
}

function interpolatedRoutePoint(points, progress, stepLimit) {
  if (!points.length) return null;
  if (points.length === 1 || stepLimit <= 0) return points[0];

  const ratio = Math.max(0, Math.min(1, progress / stepLimit));
  const lengths = [];
  let totalLength = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    const length = Math.hypot(points[index + 1].x - points[index].x, points[index + 1].y - points[index].y);
    lengths.push(length);
    totalLength += length;
  }
  let remaining = totalLength * ratio;
  for (let index = 0; index < lengths.length; index += 1) {
    if (remaining <= lengths[index]) {
      const localRatio = lengths[index] ? remaining / lengths[index] : 0;
      return {
        x: points[index].x + (points[index + 1].x - points[index].x) * localRatio,
        y: points[index].y + (points[index + 1].y - points[index].y) * localRatio,
      };
    }
    remaining -= lengths[index];
  }
  return points[points.length - 1];
}

function renderMap() {
  if (!state.map) return;
  renderMapInto(qs("#libraryGrid"));
  const largeGrid = qs("#libraryGridLarge");
  if (largeGrid && !qs("#mapModal").hidden) renderMapInto(largeGrid);
}

function renderRouteOverlays() {
  if (!state.map) return;
  [qs("#libraryGrid"), !qs("#mapModal").hidden ? qs("#libraryGridLarge") : null].forEach((grid) => {
    if (!grid) return;
    grid.querySelector(".route-lines")?.remove();
    renderRouteLines(grid);
  });
}

function renderMapInto(grid) {
  if (!grid || !state.map) return;
  const selectedSeatKey = state.selectedSeat ? `${state.selectedSeat[0]},${state.selectedSeat[1]}` : "";
  const targetByCell = new Map();
  state.targets.forEach((target, index) => {
    targetByCell.set(`${target.row},${target.col}`, index + 1);
  });
  grid.innerHTML = "";
  for (let r = 0; r < state.map.size; r++) {
    for (let c = 0; c < state.map.size; c++) {
      const cell = document.createElement("button");
      const value = state.map.grid[r][c];
      cell.className = "cell";
      if (value === 1) cell.classList.add("shelf");
      if (value === 2) cell.classList.add("entrance");
      if (value === 4) cell.classList.add("crowded");
      if (value === 5) {
        cell.classList.add("reading");
        cell.dataset.seat = "true";
      }
      if (targetByCell.has(`${r},${c}`)) {
        cell.className = "cell target";
        cell.textContent = targetByCell.get(`${r},${c}`);
      }
      if (`${r},${c}` === selectedSeatKey) {
        cell.className = "cell seat";
        cell.textContent = "S";
      }
      cell.title = `(${r}, ${c})`;
      cell.dataset.row = r;
      cell.dataset.col = c;
      grid.appendChild(cell);
    }
  }
  renderRouteLines(grid);
}

function renderRouteLines(grid) {
  if (!state.segments.length) return;
  const rect = grid.getBoundingClientRect();
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.classList.add("route-lines");
  svg.setAttribute("viewBox", `0 0 ${rect.width} ${rect.height}`);
  svg.setAttribute("aria-hidden", "true");
  grid.appendChild(svg);

  state.segments.forEach((segment, index) => {
    if (state.activeSegment != null && state.activeSegment !== index) {
      renderRouteSegment(svg, grid, segment, index, true);
      return;
    }
    renderRouteSegment(svg, grid, segment, index, false);
  });

}

function renderRouteSegment(svg, grid, segment, index, muted) {
  const path = segment.path || [];
  if (path.length < 2) return;
  const points = routeVisualPoints(grid, path, index);
  if (points.length < 2) return;

  const colorIndex = index % ROUTE_COLORS.length;
  const line = document.createElementNS(SVG_NS, "polyline");
  line.classList.add("route-line");
  if (muted) line.classList.add("muted");
  line.setAttribute("points", points.map((point) => `${point.x},${point.y}`).join(" "));
  line.setAttribute("stroke", ROUTE_COLORS[colorIndex]);

  const progress = progressForSegment(index);
  svg.appendChild(line);

  const totalLength = Math.max(1, line.getTotalLength ? line.getTotalLength() : path.length);
  const progressLength = totalLength * Math.min(1, progress / Math.max(1, path.length - 1));
  line.style.strokeDasharray = `${totalLength}`;
  line.style.strokeDashoffset = `${Math.max(0, totalLength - progressLength)}`;

  if (progress >= path.length - 1) {
    renderRouteArrow(svg, points, colorIndex, muted);
  } else if (!muted && progress > 0) {
    renderMovingRouteArrow(svg, grid, path, index, colorIndex, progress);
  }
}

function renderRouteArrow(svg, points, colorIndex, muted) {
  const tip = points[points.length - 1];
  const previous = points[points.length - 2];
  if (!tip || !previous) return;

  const angle = Math.atan2(tip.y - previous.y, tip.x - previous.x) * 180 / Math.PI;
  const arrow = document.createElementNS(SVG_NS, "polygon");
  arrow.classList.add("route-arrow");
  if (muted) arrow.classList.add("muted");
  arrow.setAttribute("points", "0,-5 10,0 0,5");
  arrow.setAttribute("fill", ROUTE_COLORS[colorIndex]);
  arrow.setAttribute("transform", `translate(${tip.x} ${tip.y}) rotate(${angle})`);
  svg.appendChild(arrow);
}

function renderMovingRouteArrow(svg, grid, path, segmentIndex, colorIndex, progress) {
  const points = routeVisualPoints(grid, path, segmentIndex);
  const position = interpolatedRoutePoint(points, progress, Math.max(1, path.length - 1));
  const previous = interpolatedRoutePoint(points, Math.max(0, progress - 0.12), Math.max(1, path.length - 1));
  if (!position || !previous) return;

  const angle = Math.atan2(position.y - previous.y, position.x - previous.x) * 180 / Math.PI;
  const arrow = document.createElementNS(SVG_NS, "polygon");
  arrow.classList.add("route-arrow", "moving");
  arrow.setAttribute("points", "0,-5 10,0 0,5");
  arrow.setAttribute("fill", ROUTE_COLORS[colorIndex]);
  arrow.setAttribute("transform", `translate(${position.x} ${position.y}) rotate(${angle})`);
  svg.appendChild(arrow);
}

function selectSeat(row, col) {
  state.selectedSeat = [Number(row), Number(col)];
  renderSelectedSeat();
  markRouteSettingsChanged();
}

function openMapModal() {
  qs("#mapModal").hidden = false;
  renderMapInto(qs("#libraryGridLarge"));
}

function closeMapModal() {
  qs("#mapModal").hidden = true;
}

function updateRouteProgress() {
  const path = getVisibleRoutePath();
  const playButton = qs("#playRouteButton");
  if (!playButton) return;

  const hasPath = path.length > 0;
  const isPlaying = Boolean(state.playbackTimer);

  playButton.disabled = !hasPath;
  playButton.classList.toggle("playing", isPlaying);
  playButton.textContent = isPlaying ? "Ⅱ" : "▶";
  playButton.title = isPlaying ? "暂停" : "播放";
  playButton.setAttribute("aria-label", isPlaying ? "暂停路线播放" : "播放路线");
}

function pauseRouteAnimation() {
  if (state.playbackTimer) {
    cancelAnimationFrame(state.playbackTimer);
    state.playbackTimer = null;
  }
  state.playbackStartedAt = null;
  state.playbackStartProgress = state.playbackProgress ?? 0;
  updateRouteProgress();
}

function resetRouteAnimation() {
  pauseRouteAnimation();
  state.playbackProgress = null;
  state.playbackStartedAt = null;
  state.playbackStartProgress = 0;
  renderMap();
  updateRouteProgress();
}

function advanceRouteAnimation(timestamp) {
  const path = getVisibleRoutePath();
  if (!path.length) {
    resetRouteAnimation();
    return;
  }
  if (state.playbackStartedAt == null) state.playbackStartedAt = timestamp;
  const elapsed = timestamp - state.playbackStartedAt;
  state.playbackProgress = Math.min(
    getPlaybackLimit(),
    state.playbackStartProgress + elapsed / ROUTE_PLAYBACK_STEP_MS,
  );
  renderRouteOverlays();
  if (state.playbackProgress >= getPlaybackLimit()) {
    pauseRouteAnimation();
    return;
  }
  state.playbackTimer = requestAnimationFrame(advanceRouteAnimation);
  updateRouteProgress();
}

function playRouteAnimation() {
  const path = getVisibleRoutePath();
  if (!path.length || state.playbackTimer) return;
  if (state.playbackProgress == null || state.playbackProgress >= getPlaybackLimit()) {
    state.playbackProgress = 0;
  }
  state.playbackStartProgress = state.playbackProgress;
  state.playbackStartedAt = null;
  renderRouteOverlays();
  state.playbackTimer = requestAnimationFrame(advanceRouteAnimation);
  updateRouteProgress();
}

function toggleRouteAnimation() {
  if (state.playbackTimer) {
    pauseRouteAnimation();
    return;
  }
  playRouteAnimation();
}

function renderRouteSteps() {
  const box = qs("#routeSteps");
  box.innerHTML = "";
  qs("#routeStepCount").textContent = `${state.segments.length} 步`;
  updateRouteStepNavigation();
  if (!state.segments.length) {
    box.innerHTML = `
      <div class="route-empty">
        生成路径后会显示取书步骤
      </div>
    `;
    return;
  }

  state.segments.forEach((segment, index) => {
    const item = document.createElement("button");
    item.className = `route-step ${state.activeSegment === index ? "active" : ""}`;
    item.dataset.segment = index;
    item.id = `routeStep${index}`;
    const directions = segment.instructions?.length ? segment.instructions.join("，") : "无需移动";
    const title = segment.type === "seat"
      ? "前往阅读区"
      : `前往 ${escapeHtml(segment.shelfId)}`;
    const bookLine = segment.type === "book"
      ? `<strong>${escapeHtml(segment.bookTitle)}</strong><br><span>${escapeHtml(segment.pickupSide)}取书</span>`
      : `<strong>到达阅读区座位</strong><br><span>完成本次取书</span>`;
    item.innerHTML = `
      <span class="route-step-index">${index + 1}</span>
      <div class="route-step-body">
        <span class="route-step-title">${title}</span>
        ${bookLine}
        <span>距离：${segment.distance} 步</span>
        <span>方向：${escapeHtml(directions)}</span>
      </div>
    `;
    box.appendChild(item);
  });
}

function updateRouteStepNavigation() {
  const previous = qs("#previousRouteStep");
  const next = qs("#nextRouteStep");
  if (!previous || !next) return;
  const hasSteps = state.segments.length > 0;
  previous.disabled = !hasSteps || state.activeSegment == null || state.activeSegment <= 0;
  next.disabled = !hasSteps || state.activeSegment === state.segments.length - 1;
}

function selectRouteSegment(index, shouldPlay = false) {
  if (!state.segments.length) return;
  const nextIndex = Math.max(0, Math.min(index, state.segments.length - 1));
  pauseRouteAnimation();
  state.activeSegment = nextIndex;
  state.playbackProgress = null;
  state.playbackStartedAt = null;
  state.playbackStartProgress = 0;
  renderRouteSteps();
  renderMap();
  updateRouteProgress();
  qs(`#routeStep${nextIndex}`)?.scrollIntoView({ block: "nearest" });
  if (shouldPlay) playRouteAnimation();
}

function moveRouteSegment(delta) {
  if (!state.segments.length) return;
  const current = state.activeSegment == null ? (delta > 0 ? -1 : state.segments.length) : state.activeSegment;
  selectRouteSegment(current + delta, true);
}

async function planPath(options = {}) {
  window.clearTimeout(state.autoPlanTimer);
  state.autoPlanTimer = null;
  const ids = state.pickupSelection.map((book) => Number(book.id));
  if (!ids.length) {
    openNotice("需要至少选择一本想取的书。", "需要选择图书");
    resetPathMetrics();
    return;
  }
  if (!state.selectedSeat) {
    openNotice("需要点击绿色格子来确定最终座位。", "需要选择终点座位");
    return;
  }
  const algorithm = qs("#algorithmSelect").value;
  const method = qs("#solverSelect")?.value || "";
  const useConstraints = constraintsEnabled();
  if (!algorithm || !method) {
    openNotice("需要先选择两点路径算法和整体取书算法。", "需要选择算法");
    resetPathMetrics();
    return;
  }
  const requestId = ++state.planRequestId;
  pauseRouteAnimation();
  resetPathMetrics("路径生成中...");
  let result;
  try {
    result = await api("/api/pickup/solve", {
      method: "POST",
      body: JSON.stringify({ bookIds: ids, algorithm, method, end: state.selectedSeat, constraintsEnabled: useConstraints }),
    });
    if (requestId !== state.planRequestId) return;
  } catch (err) {
    if (requestId !== state.planRequestId) return;
    state.path = [];
    state.targets = [];
    state.segments = [];
    state.activeSegment = null;
    state.playbackProgress = null;
    state.playbackStartedAt = null;
    state.playbackStartProgress = 0;
    state.latestRouteResult = null;
    resetPathMetrics();
    renderCspMetrics();
    renderRouteSteps();
    renderMap();
    updateRouteProgress();
    return;
  }
  if (!result) return;
  if (result.algorithm !== algorithm || result.method !== method || Boolean(result.constraintsEnabled) !== useConstraints) {
    resetPathMetrics();
    return;
  }
  state.path = result.path || [];
  state.targets = result.visitOrder || [];
  state.segments = result.segments || [];
  state.autoPlanEnabled = true;
  state.latestRouteResult = result;
  state.activeSegment = null;
  state.playbackProgress = null;
  state.playbackStartedAt = null;
  state.playbackStartProgress = 0;
  const pathAlgorithm = selectedOptionText("#algorithmSelect", result.algorithm.toUpperCase());
  const orderAlgorithm = selectedOptionText("#solverSelect", String(result.method || method).toUpperCase());
  qs("#pathMetrics").classList.remove("analysis-empty");
  qs("#pathMetrics").innerHTML = `
    <section class="analysis-group">
      <div class="metric-row"><span>总代价</span><strong>${result.distance}</strong></div>
      <div class="metric-row"><span>两点算法</span><strong>${escapeHtml(pathAlgorithm)}</strong></div>
      <div class="metric-row"><span>整体算法</span><strong>${escapeHtml(orderAlgorithm)}</strong></div>
      <div class="metric-row"><span>约束模式</span><strong>${result.constraintsEnabled ? "CSP 开启" : "普通"}</strong></div>
      ${result.pathExpanded != null ? `<div class="metric-row"><span>底层路径扩展</span><strong>${result.pathExpanded}</strong></div>` : ""}
      ${result.solverExpanded != null ? `<div class="metric-row"><span>整体规划扩展</span><strong>${result.solverExpanded}</strong></div>` : ""}
      <div class="metric-row"><span>路径计算时间</span><strong>${result.runtimeMs} ms</strong></div>
    </section>
  `;
  renderCspMetrics(result);
  renderRouteSteps();
  renderMap();
  updateRouteProgress();
}

function compareLabel(list, value) {
  return list.find(([key]) => key === value)?.[1] || value;
}

function closeCompareModal() {
  state.compareRequestId += 1;
  qs("#algorithmCompareModal").hidden = true;
}

function setCompareModeButtons(activeType = "") {
  document.querySelectorAll("[data-compare-type]").forEach((button) => {
    const active = button.dataset.compareType === activeType;
    button.classList.toggle("active", active);
    button.disabled = active;
    button.setAttribute("aria-pressed", String(active));
  });
}

function openCompareModal() {
  const task = compareTaskPayload();
  if (!task) return;
  setCompareModeButtons("");
  qs("#compareTitle").textContent = "多算法比较";
  qs("#compareSubtitle").textContent = "选择固定一类算法后，比较另一类算法的表现。";
  qs("#compareSummary").innerHTML = `
    <span>本次取书<strong>${task.ids.length} 本</strong></span>
    <span>终点座位<strong>(${task.end[0]}, ${task.end[1]})</strong></span>
    <span>当前组合<strong>${escapeHtml(selectedOptionText("#algorithmSelect", "-"))} + ${escapeHtml(selectedOptionText("#solverSelect", "-"))}</strong></span>
    <span>约束模式<strong>${task.constraintsEnabled ? "CSP" : "普通"}</strong></span>
  `;
  qs("#compareTableWrap").innerHTML = `<div class="compare-loading">请选择一种比较方式。</div>`;
  qs("#algorithmCompareModal").hidden = false;
}

function compareTaskPayload() {
  const ids = state.pickupSelection.map((book) => Number(book.id));
  if (!ids.length) {
    openNotice("请至少选择一本想取的书。", "需要选择图书");
    return null;
  }
  if (!state.selectedSeat) {
    openNotice("需要点击绿色格子来确定最终座位。", "需要选择终点座位");
    return null;
  }
  return { ids, end: state.selectedSeat, constraintsEnabled: constraintsEnabled() };
}

async function openAlgorithmCompare(type) {
  const task = compareTaskPayload();
  if (!task) return;

  const requestId = ++state.compareRequestId;
  const currentPathAlgorithm = qs("#algorithmSelect").value;
  const currentOrderAlgorithm = qs("#solverSelect").value;
  if (!currentPathAlgorithm || !currentOrderAlgorithm) {
    qs("#compareTableWrap").innerHTML = `<div class="compare-error">请先选择两点路径算法和整体取书算法。</div>`;
    return;
  }
  setCompareModeButtons(type);
  const comparePath = type === "path";
  const compareConstraints = type === "constraints";
  const title = compareConstraints ? "CSP 模式比较" : comparePath ? "两点路径算法比较" : "整体取书算法比较";
  const fixedLabel = compareConstraints
    ? `固定算法组合：${compareLabel(PATH_ALGORITHMS, currentPathAlgorithm)} + ${compareLabel(ORDER_ALGORITHMS, currentOrderAlgorithm)}`
    : comparePath
    ? `固定整体算法：${compareLabel(ORDER_ALGORITHMS, currentOrderAlgorithm)}`
    : `固定两点算法：${compareLabel(PATH_ALGORITHMS, currentPathAlgorithm)}`;
  const candidates = compareConstraints ? [[false, "普通模式"], [true, "CSP 开启"]] : comparePath ? PATH_ALGORITHMS : ORDER_ALGORITHMS;

  qs("#compareTitle").textContent = title;
  qs("#compareSubtitle").textContent = "比较结果只用于分析，不会改变当前地图路线。";
  qs("#compareSummary").innerHTML = `
    <span>本次取书<strong>${task.ids.length} 本</strong></span>
    <span>终点座位<strong>(${task.end[0]}, ${task.end[1]})</strong></span>
    <span>${escapeHtml(fixedLabel.split("：")[0])}<strong>${escapeHtml(fixedLabel.split("：")[1] || "-")}</strong></span>
    <span>约束模式<strong>${task.constraintsEnabled ? "CSP" : "普通"}</strong></span>
  `;
  qs("#compareTableWrap").innerHTML = `<div class="compare-loading">比较中...</div>`;
  qs("#algorithmCompareModal").hidden = false;

  const rows = [];
  for (const [value, label] of candidates) {
    const algorithm = comparePath ? value : currentPathAlgorithm;
    const method = comparePath || compareConstraints ? currentOrderAlgorithm : value;
    const useConstraints = compareConstraints ? value : task.constraintsEnabled;
    try {
      const result = await api("/api/pickup/solve", {
        method: "POST",
        body: JSON.stringify({ bookIds: task.ids, algorithm, method, end: task.end, constraintsEnabled: useConstraints }),
      });
      rows.push({
        value,
        label,
        current: compareConstraints ? value === task.constraintsEnabled : comparePath ? value === currentPathAlgorithm : value === currentOrderAlgorithm,
        result,
      });
    } catch (err) {
      rows.push({
        value,
        label,
        current: compareConstraints ? value === task.constraintsEnabled : comparePath ? value === currentPathAlgorithm : value === currentOrderAlgorithm,
        error: err.message,
      });
    }
    if (requestId !== state.compareRequestId) return;
  }
  renderCompareRows(rows, compareConstraints ? "CSP 模式" : "算法", compareConstraints);
}

function compareMetricValue(row, key) {
  if (key === "cspRuntimeMs") return row.result?.constraintStats?.cspRuntimeMs ?? 0;
  return row.result?.[key];
}

function renderCompareRows(rows, labelHeader = "算法", includeCspStats = false) {
  const successful = rows.filter((row) => row.result && row.result.distance != null);
  const metricKeys = includeCspStats
    ? ["distance", "pathExpanded", "solverExpanded", "runtimeMs", "cspRuntimeMs"]
    : ["distance", "pathExpanded", "solverExpanded", "runtimeMs"];
  const metricRanges = Object.fromEntries(metricKeys.map((key) => {
    const values = successful
      .map((row) => Number(compareMetricValue(row, key)))
      .filter((value) => Number.isFinite(value));
    if (!values.length) return [key, { min: null, max: null }];
    return [key, { min: Math.min(...values), max: Math.max(...values) }];
  }));
  const metricClass = (key, value) => {
    const number = Number(value);
    const range = metricRanges[key];
    if (!range || range.min == null || range.max == null || range.min === range.max || !Number.isFinite(number)) return "";
    if (number === range.min) return "metric-best";
    if (number === range.max) return "metric-worst";
    return "";
  };
  const metricCell = (key, value, suffix = "") => {
    if (value == null) return `<td>-</td>`;
    return `<td class="${metricClass(key, value)}">${value}${suffix}</td>`;
  };
  qs("#compareTableWrap").innerHTML = `
    <table class="compare-table">
      <thead>
        <tr>
          <th>${escapeHtml(labelHeader)}</th>
          <th>总代价</th>
          <th>底层路径扩展</th>
          <th>整体规划扩展</th>
          <th>路径计算时间</th>
          ${includeCspStats ? `<th>CSP 预处理</th>` : ""}
        </tr>
      </thead>
      <tbody>
        ${rows.map((row) => {
          if (row.error) {
            return `
              <tr class="${row.current ? "current" : ""}">
                <td>${escapeHtml(row.label)}${row.current ? `<span class="best-badge">当前</span>` : ""}</td>
                <td colspan="${includeCspStats ? 5 : 4}">${escapeHtml(row.error)}</td>
              </tr>
            `;
          }
          const result = row.result;
          return `
            <tr class="${row.current ? "current" : ""}">
              <td>${escapeHtml(row.label)}${row.current ? `<span class="best-badge">当前</span>` : ""}</td>
              ${metricCell("distance", result.distance)}
              ${metricCell("pathExpanded", result.pathExpanded)}
              ${metricCell("solverExpanded", result.solverExpanded)}
              ${metricCell("runtimeMs", result.runtimeMs, " ms")}
              ${includeCspStats ? metricCell("cspRuntimeMs", result.constraintStats?.cspRuntimeMs ?? 0, " ms") : ""}
            </tr>
          `;
        }).join("")}
      </tbody>
    </table>
  `;
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
  const submitButton = qs("#authSubmit");
  try {
    submitButton.disabled = true;
    submitButton.textContent = isRegister ? "注册中..." : "登录中...";
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
      timeoutMs: 12000,
    });
    state.token = data.token;
    localStorage.setItem("token", data.token);
    await loadMe();
    setPage("search");
  } catch (err) {
    qs("#authMessage").textContent = err.message;
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = qs("#registerTab").classList.contains("active") ? "注册" : "登录";
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
  qs("#resetSearchFilters").addEventListener("click", resetSearchFilters);
  ["#genreFilter"].forEach((selector) => {
    qs(selector).addEventListener("change", () => searchBooks({ record: false }));
  });
  ["#publisherFilter", "#yearFromFilter", "#yearToFilter", "#minRatingFilter", "#minRatingsCountFilter"].forEach((selector) => {
    qs(selector).addEventListener("keydown", (event) => {
      if (event.key === "Enter") searchBooks({ record: false });
    });
  });
  document.body.addEventListener("click", (event) => {
    const toggle = event.target.closest("[data-fav-toggle]");
    const detailsToggle = event.target.closest("[data-book-details-toggle]");
    const unfav = event.target.closest("[data-unfav]");
    const removePickup = event.target.closest("[data-remove-pickup]");
    if (detailsToggle) {
      toggleBookDetails(detailsToggle);
      return;
    }
    if (toggle) toggleFavorite(toggle.dataset.favToggle, toggle.dataset.favorite === "true");
    if (unfav) unfavoriteBook(unfav.dataset.unfav);
    if (removePickup) removePickupBook(removePickup.dataset.removePickup);
    if (event.target.closest("#addPickupBookButton")) {
      event.stopPropagation();
      toggleAddBookMenu();
      return;
    }
    if (!event.target.closest("#addBookMenu")) closeAddBookMenu();
  });
  qs("#openFavoritesButton").addEventListener("click", () => {
    closeAddBookMenu();
    openFavoritesPicker();
  });
  qs("#openSearchPickerButton").addEventListener("click", () => {
    closeAddBookMenu();
    openSearchPicker();
  });
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
  qs("#playRouteButton").addEventListener("click", toggleRouteAnimation);
  qs("#previousRouteStep").addEventListener("click", () => moveRouteSegment(-1));
  qs("#nextRouteStep").addEventListener("click", () => moveRouteSegment(1));
  qs("#solverSelect").addEventListener("change", markRouteSettingsChanged);
  qs("#algorithmSelect").addEventListener("change", markRouteSettingsChanged);
  qs("#constraintsToggle").addEventListener("change", markRouteSettingsChanged);
  document.querySelectorAll("[data-tool-toggle]").forEach((button) => {
    button.addEventListener("click", () => toggleWorkbenchTool(button.dataset.toolToggle));
  });
  document.querySelectorAll("[data-tool-action]").forEach((button) => {
    button.addEventListener("click", () => {
      if (button.dataset.toolAction === "compare") openCompareModal();
      if (button.dataset.toolAction === "expand-map") openMapModal();
    });
  });
  document.querySelectorAll("[data-workbench-view]").forEach((button) => {
    button.addEventListener("click", () => setWorkbenchView(button.dataset.workbenchView));
  });
  document.querySelectorAll("[data-algorithm-group]").forEach((group) => {
    group.addEventListener("click", (event) => {
      const option = event.target.closest(".algorithm-option");
      if (!option) return;
      setAlgorithmSelection(group.dataset.algorithmGroup, option.dataset.value);
    });
  });
  qs("#comparePathAlgorithms").addEventListener("click", () => openAlgorithmCompare("path"));
  qs("#compareOrderAlgorithms").addEventListener("click", () => openAlgorithmCompare("order"));
  qs("#compareConstraintModes").addEventListener("click", () => openAlgorithmCompare("constraints"));
  qs("#libraryGrid").addEventListener("click", (event) => {
    const cell = event.target.closest("[data-seat='true']");
    if (cell) selectSeat(cell.dataset.row, cell.dataset.col);
  });
  qs("#closeMapModal").addEventListener("click", closeMapModal);
  qs("#mapModal").addEventListener("click", (event) => {
    if (event.target.id === "mapModal") closeMapModal();
  });
  qs("#closeNoticeModal").addEventListener("click", closeNotice);
  qs("#noticeModal").addEventListener("click", (event) => {
    if (event.target.id === "noticeModal") closeNotice();
  });
  qs("#closeCompareModal").addEventListener("click", closeCompareModal);
  qs("#algorithmCompareModal").addEventListener("click", (event) => {
    if (event.target.id === "algorithmCompareModal") closeCompareModal();
  });
  qs("#libraryGridLarge").addEventListener("click", (event) => {
    const cell = event.target.closest("[data-seat='true']");
    if (cell) selectSeat(cell.dataset.row, cell.dataset.col);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !qs("#mapModal").hidden) closeMapModal();
    if (event.key === "Escape" && !qs("#noticeModal").hidden) closeNotice();
    if (event.key === "Escape" && !qs("#algorithmCompareModal").hidden) closeCompareModal();
  });
  qs("#routeSteps").addEventListener("click", (event) => {
    const step = event.target.closest("[data-segment]");
    if (!step) return;
    const index = Number(step.dataset.segment);
    if (state.activeSegment === index) {
      pauseRouteAnimation();
      state.activeSegment = null;
      state.playbackProgress = null;
      state.playbackStartedAt = null;
      state.playbackStartProgress = 0;
      renderRouteSteps();
      renderMap();
      updateRouteProgress();
    } else {
      selectRouteSegment(index, true);
    }
  });
  qs("#authSubmit").addEventListener("click", submitAuth);
  document.querySelectorAll(".toggle-password").forEach((button) => {
    button.addEventListener("click", () => togglePasswordVisibility(button));
  });
  qs("#changePasswordButton").addEventListener("click", changePassword);
  qs("#loginTab").addEventListener("click", () => switchAuth(false));
  qs("#registerTab").addEventListener("click", () => switchAuth(true));
}

function toggleBookDetails(button) {
  const panel = qs(`#${button.dataset.bookDetailsToggle}`);
  if (!panel) return;
  const expanded = button.getAttribute("aria-expanded") === "true";
  panel.hidden = expanded;
  button.setAttribute("aria-expanded", expanded ? "false" : "true");
  button.textContent = expanded ? "详情 ▾" : "收起 ▴";
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
  await loadSearchFacets();
  await searchBooks({ record: false });
  scheduleRecommendationRefresh(0);
  updateRouteProgress();
}

boot().catch((err) => {
  document.body.innerHTML = `<pre style="padding:24px">${escapeHtml(err.stack || err.message)}</pre>`;
});
