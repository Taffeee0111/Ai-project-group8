/*
 * Client-side controller for the library demonstration.
 *
 * The frontend is intentionally dependency-free. It manages four pages, calls the
 * JSON API, renders book and route data, animates pickup paths, and compares search
 * algorithms. Server responses remain the source of truth for catalogue and route
 * calculations; this file focuses on interaction and visualization.
 */

// Shared application state keeps navigation and asynchronous rendering consistent.
// Request IDs are used to ignore stale responses when users change options quickly.
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
  ["astar_manhattan", "A* Manhattan"],
  ["astar_euclidean", "A* Euclidean"],
];
const ORDER_ALGORITHMS = [
  ["greedy", "Greedy Nearest Neighbor"],
  ["greedy_2opt", "Greedy + 2-opt"],
];

const titles = {
  login: ["Sign In / Sign Up", ""],
  search: ["Book Search", ""],
  pickup: ["Pickup Route Planning", ""],
  profile: ["Profile", ""],
};

// ---------------------------------------------------------------------------
// API, navigation, and reusable book presentation
// ---------------------------------------------------------------------------

function qs(selector) {
  return document.querySelector(selector);
}

function authHeaders() {
  return state.token ? { Authorization: `Bearer ${state.token}` } : {};
}

async function api(path, options = {}) {
  // AbortController prevents a slow request from leaving the interface waiting
  // indefinitely. Authentication and JSON headers are applied in one place.
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
    if (!response.ok) throw new Error(data.error || "Request failed");
    return data;
  } catch (err) {
    if (err.name === "AbortError") throw new Error("Request timed out. Please try again later.");
    throw err;
  } finally {
    if (timeoutId) window.clearTimeout(timeoutId);
  }
}

function setPage(page) {
  // Pause route playback before leaving the workbench so hidden animation frames
  // do not continue consuming resources or mutate visible state unexpectedly.
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
  // One card renderer is reused by search, favorites, recommendations, and pickup
  // selection. Options enable only the controls appropriate to each context.
  const keyword = options.highlight || "";
  const useDatasetSummary = Boolean(options.datasetMeta);
  const useDetails = Boolean(options.collapsibleDetails);
  const detailId = `book-details-${book.id}`;
  const canToggleFavorite = options.favoriteToggle;
  const isFavorite = Boolean(book.is_favorite);
  const favoriteButton = isFavorite
    ? `<button class="favorite-button active" data-fav-toggle="${book.id}" data-favorite="true">Favorited</button>`
    : `<button class="favorite-button" data-fav-toggle="${book.id}" data-favorite="false">Favorite</button>`;
  const detailsButton = useDetails
    ? `<button class="book-details-toggle" data-book-details-toggle="${detailId}" aria-expanded="false" aria-controls="${detailId}">Details ▾</button>`
    : "";
  const div = document.createElement("article");
  div.className = "book-card";
  div.innerHTML = `
    <h3>${highlightText(book.title, keyword)}</h3>
    <div class="book-card-summary">
      <div class="book-meta-line">${highlightText(book.author || "Unknown", keyword)} · <span class="tag">${highlightText(book.category || "Uncategorized", keyword)}</span></div>
      ${useDatasetSummary ? bookPublisherLine(book, keyword) : `<div class="book-meta-line">Shelf ${escapeHtml(book.shelf_id)} / Slot ${escapeHtml(book.shelf_slot)} · Coordinates (${escapeHtml(book.row)}, ${escapeHtml(book.col)})</div>`}
      ${useDatasetSummary ? bookMetricGrid(book) : ""}
      ${useDatasetSummary ? genrePreview(book.genres, keyword) : ""}
      ${book.similarity_percent !== undefined && book.similarity_percent !== null ? `<br><span class="ml-score">Similarity: ${book.similarity_percent}%</span>` : ""}
    </div>
    ${useDetails ? bookDetailsPanel(book, keyword, detailId) : ""}
    <div class="book-actions">
      <span class="book-meta">${escapeHtml(book.status || "available")}</span>
      <span class="book-action-buttons">
      ${detailsButton}
      ${canToggleFavorite ? favoriteButton : ""}
      ${options.unfavorite ? `<button data-unfav="${book.id}">Remove favorite</button>` : ""}
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
    book.match_score ? detailRow("Match score", escapeHtml(book.match_score)) : "",
  ].filter(Boolean);
  const preview = descriptionPreview(book.description, keyword);
  if (preview) rows.push(detailRow("Description", preview));
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
  // All dataset and user-provided text is escaped before insertion into templates.
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
  // Highlight only after escaping so matched dataset text cannot inject markup.
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

// ---------------------------------------------------------------------------
// Catalogue search, recommendation loading, and favorites
// ---------------------------------------------------------------------------

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
    qs("#userChip").textContent = "Not signed in";
    return;
  }
  try {
    state.user = await api("/api/auth/me");
    qs("#userChip").textContent = state.user.username;
  } catch {
    localStorage.removeItem("token");
    state.token = "";
    qs("#userChip").textContent = "Not signed in";
  }
}

async function searchBooks(options = {}) {
  // Passive refreshes do not record duplicate search history; deliberate searches
  // use the API's default recording behavior.
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
      list.innerHTML = `<div class="state-card"><strong>No matching books found</strong>Try adjusting the keyword or filters.</div>`;
    } else {
      books.forEach((book) => list.appendChild(bookCard(book, { favoriteToggle: true, highlight: keyword, datasetMeta: true, collapsibleDetails: true })));
    }
    qs("#resultCount").textContent = `${books.length} books`;
    if (options.refreshRecommendations || record) scheduleRecommendationRefresh();
  } catch (err) {
    list.innerHTML = `<div class="state-card warning"><strong>Search is temporarily unavailable</strong>${escapeHtml(err.message)}</div>`;
    qs("#resultCount").textContent = "Load failed";
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
  // Debouncing combines rapid favorite changes into one recommendation refresh.
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
  profile.innerHTML = `<div class="ml-summary">Generating recommendations...</div>`;
  try {
    const data = await api("/api/books/recommendations?limit=10&analysis=1", { timeoutMs: 12000 });
    if (requestId !== state.recommendationRequestId) return;
    const keywords = data.profileKeywords || [];
    const profileGenres = data.preferredGenres || [];
    const modelStatus = data.modelStatus || {};
    const modelStatusNote = modelStatus.available
      ? ""
      : String(modelStatus.reason || "").startsWith("load_failed")
        ? "Model loading failed. Showing popular recommendations instead."
        : "You can use the app without a trained model. Popular highly rated books are shown now.";
    profile.innerHTML = `
      ${data.summary ? `<div class="ml-summary">${escapeHtml(data.summary)}</div>` : ""}
      <div class="ml-weights">
        <span>Model <strong>${modelStatus.available ? "Loaded" : "Not trained"}</strong></span>
        ${modelStatus.embeddingDim ? `<span>Embedding <strong>${escapeHtml(modelStatus.embeddingDim)}</strong></span>` : ""}
        ${modelStatus.interactionCount ? `<span>Interactions <strong>${formatNumber(modelStatus.interactionCount)}</strong></span>` : ""}
      </div>
      ${modelStatusNote ? `<div class="ml-summary">${escapeHtml(modelStatusNote)}</div>` : ""}
      <div class="ml-keywords">
        ${keywords.length
          ? keywords.map((item) => `<span>${escapeHtml(item.term)}</span>`).join("")
          : `<span>${state.token ? "No profile keywords yet" : "Sign in to build a user profile"}</span>`}
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
      list.innerHTML = `<div class="state-card"><strong>No recommendations yet</strong>Search for or favorite a few books to improve recommendations.</div>`;
    } else {
      books.forEach((book) => list.appendChild(bookCard(book, { favoriteToggle: true })));
    }
  } catch (err) {
    if (requestId !== state.recommendationRequestId) return;
    profile.innerHTML = `<div class="state-card warning"><strong>Recommendations are temporarily unavailable</strong>Search and pickup planning are still available.</div>`;
    list.innerHTML = `<div class="state-card warning"><strong>Could not load recommendations</strong>${escapeHtml(err.message)}</div>`;
  } finally {
    if (requestId === state.recommendationRequestId) profile.classList.remove("is-loading");
  }
}

function setFavoriteButtonsState(bookId, isFavorite, disabled = false) {
  document.querySelectorAll(`[data-fav-toggle="${bookId}"]`).forEach((button) => {
    button.dataset.favorite = isFavorite ? "true" : "false";
    button.classList.toggle("active", isFavorite);
    button.textContent = isFavorite ? "Favorited" : "Favorite";
    button.disabled = disabled;
  });
}

async function toggleFavorite(bookId, isFavorite) {
  // Optimistic button updates make the action feel immediate. On failure, every
  // matching button is restored to the server-confirmed previous state.
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
    openNotice(err.message, "Favorite failed");
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
    openNotice(err.message, "Remove favorite failed");
  }
}

async function loadPickup() {
  resetRouteAnimation();
  if (!state.token) {
    qs("#pickupSelection").innerHTML = `<div class="profile-card">Sign in before creating a pickup task.</div>`;
    qs("#pickupCount").textContent = "0 books";
    return;
  }
  const map = await api("/api/library-map");
  state.map = map;
  qs("#mapShelfCount").textContent = `${map.shelves.length} shelves`;
  renderPickupSelection();
  renderSelectedSeat();
  renderRouteSteps();
  syncAlgorithmOptions("algorithmSelect");
  syncAlgorithmOptions("solverSelect");
  renderCspMetrics();
  renderMap();
}

// ---------------------------------------------------------------------------
// Pickup workbench state, selected books, and picker modal
// ---------------------------------------------------------------------------

function renderSelectedSeat() {
  const box = qs("#selectedSeatInfo");
  if (!box) return;
  if (!state.selectedSeat) {
    box.textContent = "Destination seat: none";
    return;
  }
  const [row, col] = state.selectedSeat;
  box.textContent = `Destination seat: reading area (${row}, ${col})`;
}

function resetPathMetrics(message = "Waiting for route") {
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
      <div class="metric-row"><span>CSP searchable cells</span><strong>${allowed} / ${original}</strong></div>
      <div class="metric-row"><span>CSP pruned cells</span><strong>${stats.prunedCells ?? 0}</strong></div>
      <div class="metric-row"><span>CSP fallback segments</span><strong>${stats.fallbackSegments ?? 0}</strong></div>
      <div class="metric-row"><span>CSP preprocessing</span><strong>${stats.cspRuntimeMs ?? 0} ms</strong></div>
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
  box.innerHTML = `<strong>${constraintsEnabled() ? "Generate a route to show CSP metrics" : "Enable CSP, then generate a route"}</strong>`;
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
  // Route settings may change several times in quick succession; schedule only
  // one recalculation once the control changes settle.
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
  qs("#pickupCount").textContent = `${state.pickupSelection.length} books`;

  state.pickupSelection.forEach((book, index) => {
    const item = document.createElement("article");
    item.className = "selected-book";
    item.innerHTML = `
      <span class="selection-index">${index + 1}</span>
      <span class="selected-book-body">
        <strong>${escapeHtml(book.title)}</strong>
        <br><span class="book-meta">${escapeHtml(book.author || "Unknown")} · ${escapeHtml(book.category || "Uncategorized")} · ${escapeHtml(book.shelf_id)} (${book.row}, ${book.col})</span>
      </span>
      <button class="remove-selected-book" data-remove-pickup="${book.id}" aria-label="Remove ${escapeHtml(book.title)}" title="Remove">×</button>
    `;
    box.appendChild(item);
  });

  if (!state.pickupSelection.length) {
    box.innerHTML = `
      <div class="pickup-empty-hint">Click the + button to add books</div>
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

function openNotice(message = "Click a green cell to choose the destination seat.", title = "Notice") {
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
  menu.style.width = "";
  const menuWidth = menu.offsetWidth;
  const panelPadding = 8;
  const rightAlignedLeft = buttonRect.right - panelRect.left - menuWidth;
  const maxLeft = Math.max(panelPadding, panelRect.width - menuWidth - panelPadding);
  const left = Math.min(Math.max(panelPadding, rightAlignedLeft), maxLeft);
  menu.style.left = `${left}px`;
  menu.style.top = `${buttonRect.bottom - panelRect.top + 6}px`;
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
  // Picker selections are staged separately and committed only on confirmation.
  state.pickerMode = mode;
  state.pickerItems = items;
  state.pickerTempSelected = selectedPickupIds();
  qs("#bookPickerModal").hidden = false;
  qs("#bookPickerTitle").textContent = mode === "favorites" ? "My Favorites" : "Search Books";
  qs("#bookPickerSubtitle").textContent = mode === "favorites"
    ? "Select favorite books for this pickup task."
    : "Search results can be added directly; they do not need to be favorites first.";
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
  qs("#pickerStatus").textContent = `${state.pickerItems.length} books available, ${selectedInCurrentList} selected`;
  qs("#pickerSelectAll").checked = state.pickerItems.length > 0 && state.pickerItems.every((book) => selected.has(Number(book.id)));

  if (!state.pickerItems.length) {
    list.innerHTML = `<div class="profile-card">${state.pickerMode === "search" ? "Enter a keyword to search books." : "No favorite books yet."}</div>`;
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
        <br><span class="book-meta">${escapeHtml(book.author || "Unknown")} · ${escapeHtml(book.category || "Uncategorized")} · Shelf ${escapeHtml(book.shelf_id)} / Coordinates (${book.row}, ${book.col})</span>
      </span>
      ${alreadySelected.has(Number(book.id)) ? `<em>Already in list</em>` : ""}
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

// ---------------------------------------------------------------------------
// Route geometry and map rendering
// ---------------------------------------------------------------------------

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
  // Offset shared route runs so repeated paths remain visually distinguishable.
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
  // Split a path into straight runs so overlapping routes can be offset without
  // breaking corners or drawing every individual grid edge as a separate element.
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
  // Count canonical undirected edges to find segments shared by multiple routes.
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
  // Center sibling routes around the grid line instead of pushing all of them one way.
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

  // Route animation advances by path steps, but SVG drawing needs distance along the polyline.
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
  // The same renderer targets the workbench map and the enlarged modal map.
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
  // SVG overlays preserve sharp route lines while the underlying map remains an
  // accessible grid of clickable HTML cells.
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
  // Stroke dashing lets the same renderer show both full routes and playback progress.
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

// ---------------------------------------------------------------------------
// Route playback and step navigation
// ---------------------------------------------------------------------------

function updateRouteProgress() {
  const path = getVisibleRoutePath();
  const playButton = qs("#playRouteButton");
  if (!playButton) return;

  const hasPath = path.length > 0;
  const isPlaying = Boolean(state.playbackTimer);

  playButton.disabled = !hasPath;
  playButton.classList.toggle("playing", isPlaying);
  playButton.textContent = isPlaying ? "Ⅱ" : "▶";
  playButton.title = isPlaying ? "Pause" : "Play";
  playButton.setAttribute("aria-label", isPlaying ? "Pause route playback" : "Play route");
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
  // requestAnimationFrame supplies elapsed time; progress is represented in path
  // steps so playback speed remains predictable across different route shapes.
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
  qs("#routeStepCount").textContent = `${state.segments.length} steps`;
  updateRouteStepNavigation();
  if (!state.segments.length) {
    box.innerHTML = `
      <div class="route-empty">
        Pickup steps will appear after a route is generated
      </div>
    `;
    return;
  }

  state.segments.forEach((segment, index) => {
    const item = document.createElement("button");
    item.className = `route-step ${state.activeSegment === index ? "active" : ""}`;
    item.dataset.segment = index;
    item.id = `routeStep${index}`;
    const directions = segment.instructions?.length ? segment.instructions.join(", ") : "No movement needed";
    const title = segment.type === "seat"
      ? "Go to reading area"
      : `Go to ${escapeHtml(segment.shelfId)}`;
    const bookLine = segment.type === "book"
      ? `<strong>${escapeHtml(segment.bookTitle)}</strong><br><span>Pick up from the ${escapeHtml(segment.pickupSide)}</span>`
      : `<strong>Arrive at reading-area seat</strong><br><span>Finish this pickup task</span>`;
    item.innerHTML = `
      <span class="route-step-index">${index + 1}</span>
      <div class="route-step-body">
        <span class="route-step-title">${title}</span>
        ${bookLine}
        <span>Distance: ${segment.distance} steps</span>
        <span>Directions: ${escapeHtml(directions)}</span>
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
  // Each planning request receives an ID. A late response is discarded if the
  // user has already changed books, algorithms, constraints, or destination.
  window.clearTimeout(state.autoPlanTimer);
  state.autoPlanTimer = null;
  const ids = state.pickupSelection.map((book) => Number(book.id));
  if (!ids.length) {
    openNotice("Select at least one book to pick up.", "Books Required");
    resetPathMetrics();
    return;
  }
  if (!state.selectedSeat) {
    openNotice("Click a green cell to choose the destination seat.", "Destination Seat Required");
    return;
  }
  const algorithm = qs("#algorithmSelect").value;
  const method = qs("#solverSelect")?.value || "";
  const useConstraints = constraintsEnabled();
  if (!algorithm || !method) {
    openNotice("Select both a two-point path algorithm and a visit order algorithm.", "Algorithms Required");
    resetPathMetrics();
    return;
  }
  const requestId = ++state.planRequestId;
  pauseRouteAnimation();
  resetPathMetrics("Generating route...");
  let result;
  try {
    result = await api("/api/pickup/solve", {
      method: "POST",
      body: JSON.stringify({ bookIds: ids, algorithm, method, end: state.selectedSeat, constraintsEnabled: useConstraints }),
    });
    // Ignore late responses after the user changes algorithms, CSP mode, books, or seat.
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
      <div class="metric-row"><span>Total cost</span><strong>${result.distance}</strong></div>
      <div class="metric-row"><span>Path algorithm</span><strong>${escapeHtml(pathAlgorithm)}</strong></div>
      <div class="metric-row"><span>Visit order algorithm</span><strong>${escapeHtml(orderAlgorithm)}</strong></div>
      <div class="metric-row"><span>Constraint mode</span><strong>${result.constraintsEnabled ? "CSP enabled" : "Standard"}</strong></div>
      ${result.pathExpanded != null ? `<div class="metric-row"><span>Path nodes expanded</span><strong>${result.pathExpanded}</strong></div>` : ""}
      ${result.solverExpanded != null ? `<div class="metric-row"><span>Planner nodes expanded</span><strong>${result.solverExpanded}</strong></div>` : ""}
      <div class="metric-row"><span>Route runtime</span><strong>${result.runtimeMs} ms</strong></div>
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
  qs("#compareTitle").textContent = "Algorithm Comparison";
  qs("#compareSubtitle").textContent = "Fix one algorithm type, then compare the other.";
  qs("#compareSummary").innerHTML = `
    <span>This pickup<strong>${task.ids.length} books</strong></span>
    <span>Destination seat<strong>(${task.end[0]}, ${task.end[1]})</strong></span>
    <span>Current combination<strong>${escapeHtml(selectedOptionText("#algorithmSelect", "-"))} + ${escapeHtml(selectedOptionText("#solverSelect", "-"))}</strong></span>
    <span>Constraint mode<strong>${task.constraintsEnabled ? "CSP" : "Standard"}</strong></span>
  `;
  qs("#compareTableWrap").innerHTML = `<div class="compare-loading">Choose a comparison mode.</div>`;
  qs("#algorithmCompareModal").hidden = false;
}

function compareTaskPayload() {
  const ids = state.pickupSelection.map((book) => Number(book.id));
  if (!ids.length) {
    openNotice("Select at least one book to pick up.", "Books Required");
    return null;
  }
  if (!state.selectedSeat) {
    openNotice("Click a green cell to choose the destination seat.", "Destination Seat Required");
    return null;
  }
  return { ids, end: state.selectedSeat, constraintsEnabled: constraintsEnabled() };
}

// ---------------------------------------------------------------------------
// Algorithm comparison, profile, and authentication
// ---------------------------------------------------------------------------

async function openAlgorithmCompare(type) {
  // Comparisons reuse the exact same selected books and destination, ensuring the
  // displayed metric differences come from algorithms rather than task changes.
  const task = compareTaskPayload();
  if (!task) return;

  const requestId = ++state.compareRequestId;
  const currentPathAlgorithm = qs("#algorithmSelect").value;
  const currentOrderAlgorithm = qs("#solverSelect").value;
  if (!currentPathAlgorithm || !currentOrderAlgorithm) {
    qs("#compareTableWrap").innerHTML = `<div class="compare-error">Select both a two-point path algorithm and a visit order algorithm first.</div>`;
    return;
  }
  setCompareModeButtons(type);
  const comparePath = type === "path";
  const compareConstraints = type === "constraints";
  const title = compareConstraints ? "CSP Mode Comparison" : comparePath ? "Two-Point Path Algorithm Comparison" : "Visit Order Algorithm Comparison";
  const fixedLabel = compareConstraints
    ? `Fixed algorithm combination: ${compareLabel(PATH_ALGORITHMS, currentPathAlgorithm)} + ${compareLabel(ORDER_ALGORITHMS, currentOrderAlgorithm)}`
    : comparePath
    ? `Fixed visit order algorithm: ${compareLabel(ORDER_ALGORITHMS, currentOrderAlgorithm)}`
    : `Fixed path algorithm: ${compareLabel(PATH_ALGORITHMS, currentPathAlgorithm)}`;
  const candidates = compareConstraints ? [[false, "Standard mode"], [true, "CSP enabled"]] : comparePath ? PATH_ALGORITHMS : ORDER_ALGORITHMS;

  qs("#compareTitle").textContent = title;
  qs("#compareSubtitle").textContent = "Comparison results are for analysis only and will not change the current map route.";
  qs("#compareSummary").innerHTML = `
    <span>This pickup<strong>${task.ids.length} books</strong></span>
    <span>Destination seat<strong>(${task.end[0]}, ${task.end[1]})</strong></span>
    <span>${escapeHtml(fixedLabel.split(":")[0])}<strong>${escapeHtml(fixedLabel.split(":").slice(1).join(":").trim() || "-")}</strong></span>
    <span>Constraint mode<strong>${task.constraintsEnabled ? "CSP" : "Standard"}</strong></span>
  `;
  qs("#compareTableWrap").innerHTML = `<div class="compare-loading">Comparing...</div>`;
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
    // Stop rendering stale comparison results if the modal was closed or restarted.
    if (requestId !== state.compareRequestId) return;
  }
  renderCompareRows(rows, compareConstraints ? "CSP mode" : "Algorithm", compareConstraints);
}

function compareMetricValue(row, key) {
  if (key === "cspRuntimeMs") return row.result?.constraintStats?.cspRuntimeMs ?? 0;
  return row.result?.[key];
}

function renderCompareRows(rows, labelHeader = "Algorithm", includeCspStats = false) {
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
          <th>Total cost</th>
          <th>Path nodes expanded</th>
          <th>Planner nodes expanded</th>
          <th>Route runtime</th>
          ${includeCspStats ? `<th>CSP preprocessing</th>` : ""}
        </tr>
      </thead>
      <tbody>
        ${rows.map((row) => {
          if (row.error) {
            return `
              <tr class="${row.current ? "current" : ""}">
                <td>${escapeHtml(row.label)}${row.current ? `<span class="best-badge">Current</span>` : ""}</td>
                <td colspan="${includeCspStats ? 5 : 4}">${escapeHtml(row.error)}</td>
              </tr>
            `;
          }
          const result = row.result;
          return `
            <tr class="${row.current ? "current" : ""}">
              <td>${escapeHtml(row.label)}${row.current ? `<span class="best-badge">Current</span>` : ""}</td>
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
    qs("#profileInfo").innerHTML = "Please sign in first.";
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
    <span class="book-meta">Registered: ${escapeHtml(me.created_at)}<br>Last sign-in: ${escapeHtml(me.last_login_at || "-")}</span>
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
    message.textContent = "Fill in all password fields.";
    return;
  }
  if (newPassword !== confirmPassword) {
    message.textContent = "The new passwords do not match.";
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
    message.textContent = "Password updated. Use the new password next time you sign in.";
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
    submitButton.textContent = isRegister ? "Signing up..." : "Signing in...";
    if (isRegister) {
      const confirm = qs("#authConfirmPassword") ? qs("#authConfirmPassword").value : "";
      if (!username || !password || !confirm) {
        qs("#authMessage").textContent = "Fill in username and password.";
        return;
      }
      if (password !== confirm) {
        qs("#authMessage").textContent = "The passwords do not match.";
        return;
      }
      if (password.length < 6) {
        qs("#authMessage").textContent = "Password must be at least 6 characters.";
        return;
      }
      await api("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({ username, password, confirmPassword: confirm }),
      });
      qs("#authMessage").textContent = "Sign up complete. You can sign in now.";
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
    submitButton.textContent = qs("#registerTab").classList.contains("active") ? "Sign Up" : "Sign In";
  }
}

// ---------------------------------------------------------------------------
// Event wiring and application startup
// ---------------------------------------------------------------------------

function bindEvents() {
  // Event delegation handles repeated book-card controls without attaching a
  // separate listener every time search or recommendation content is rerendered.
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
  button.textContent = expanded ? "Details ▾" : "Collapse ▴";
}

function togglePasswordVisibility(button) {
  const input = qs(`#${button.dataset.target}`);
  const showing = input.type === "text";
  input.type = showing ? "password" : "text";
  button.textContent = showing ? "👁" : "🙈";
  button.setAttribute("aria-label", showing ? "Show password" : "Hide password");
  button.title = showing ? "Show password" : "Hide password";
}

function switchAuth(register) {
  qs("#loginTab").classList.toggle("active", !register);
  qs("#registerTab").classList.toggle("active", register);
  qs("#authSubmit").textContent = register ? "Sign Up" : "Sign In";
  qs("#authMessage").textContent = register ? "Create a new account." : "Demo account: demo / demo123";
  // Show or hide the confirm-password field used for registration.
  const confirmLabel = qs("#authConfirmLabel");
  const confirmWrap = qs("#authConfirmWrap");
  if (confirmLabel && confirmWrap) {
    confirmLabel.style.display = register ? "block" : "none";
    confirmWrap.style.display = register ? "block" : "none";
  }
}

async function boot() {
  // Bind controls first, then load independent initial datasets in parallel.
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
