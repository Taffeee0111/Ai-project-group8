# Intelligent Library Borrowing System Implementation Notes

This document describes the current code. If this document and the code disagree, treat the code as the source of truth. The core implementation lives in `backend/server.py`, `backend/ml/train_recommender.py`, `frontend/static/index.html`, `frontend/static/app.js`, and `frontend/static/styles.css`.

## 1. Current Implementation

This project is a course-demo prototype for an intelligent library borrowing website. Its main focus is multi-target pickup route planning and search-strategy comparison. Supporting features include registration, sign-in, book search, favorites, profile management, and personalized recommendations.

Current technology stack:

- Backend: Python standard-library `http.server`, with `backend/server.py` as the entry point.
- Database: SQLite, stored in `backend/data/library.db`.
- Frontend: static HTML/CSS/JavaScript in `frontend/static/`.
- Dataset: Goodreads 10k CSV files in `backend/data/dataset/`.
- Machine learning: `scikit-learn` `TruncatedSVD` collaborative filtering plus `TfidfVectorizer` content cold start.
- Startup: run `setup.command` / `setup.bat` to create `.venv`, then `start_server.command` / `start_server.bat`; direct `python3 backend/server.py` startup also works.
- Recommendation training: `backend/ml/train_recommender.py`; training is optional and fallback recommendations keep the site usable.

The code does not use FastAPI, React, Vue, TypeScript, JWT, or a frontend build process. Auth state is stored in the backend `TOKENS` map, and the frontend calls APIs with `Authorization: Bearer <token>`.

## 2. Implemented Features

- User registration, sign-in, and current-user lookup.
- Password changes for signed-in users.
- Book search by title, author, category, description, ISBN, publisher, year, average rating, and ratings count.
- Search facets for common genres and publishers.
- Search history.
- Favorite and unfavorite books.
- Profile page with username, created time, last sign-in time, search history, and favorite books.
- SVD collaborative-filtering recommendations, TF-IDF cold-start recommendations, and popularity fallback.
- Pickup list built from favorites or search results.
- `30 * 30` library map visualization.
- User-selected destination seat in the green reading area.
- Route generation, step list, route playback, pause, reset, and expanded map modal.
- Greedy Nearest Neighbor and Greedy + 2-opt visit order strategies.
- BFS, Uniform Cost Search, A* Manhattan, and A* Euclidean two-point path strategies.
- Optional CSP pruning mode for two-point path search, with fallback to standard search.
- Algorithm metrics for total cost, path nodes expanded, planner nodes expanded, runtime, and CSP statistics.
- Algorithm comparison modal for path algorithms, visit order algorithms, and standard vs CSP mode.

## 3. Data and Database

On first startup, the backend creates or updates these SQLite tables:

- `users`: account data, password hashes, created time, and last sign-in time.
- `shelves`: shelf IDs, coordinates, style, capacity, and category area.
- `books`: imported book metadata, shelf assignment, shelf slot, and status.
- `search_history`: user search terms and timestamps.
- `favorites`: user favorite books and timestamps.

Book import behavior:

- The backend reads `backend/data/dataset/books_10k.csv` and imports 10,000 Goodreads books.
- Startup prints database and import progress so first-time users know the app is working.
- Imported metadata includes title, original title, authors, publisher, publication year, ISBN, pages, rating, ratings count, genres, top shelves, description, and image URL.
- If books already exist, startup does not duplicate them; it refreshes shelf positions and fills newly added metadata columns.
- Legacy SQLite helper tables for dataset interactions, book shelves, and book ID maps are removed during migration because recommendation training now reads CSV files directly.

Shelf assignment behavior:

- `SHELF_GROUPS` generates shelves in code.
- The current shelf count is 248.
- Books are assigned cyclically from `S001` through `S248`.
- `shelf_slot` is calculated from the book index and shelf count, rather than assuming a fixed capacity of five books per shelf.

## 4. Map Model

The map is a `30 * 30` weighted grid. The entrance is fixed at `(0, 0)`.

Cell meanings:

- `0`: normal aisle, walkable, movement cost 1.
- `1`: shelf, blocked.
- `2`: entrance.
- `4`: crowded area, walkable, movement cost 2.
- `5`: reading-area seat, valid as a destination but not as a pass-through cell.

There is no fixed exit. The user must click a green reading-area cell as the destination. A route is:

```text
Entrance -> shelf-adjacent pickup points -> selected reading-area seat
```

## 5. Route Planning Algorithms

The system uses two planning layers.

Two-point path search:

- BFS expands by step count and ignores crowded-cell priority while still reporting weighted path cost.
- Uniform Cost Search uses a priority queue by accumulated movement cost.
- A* Manhattan adds Manhattan-distance heuristic to UCS for four-direction grid movement.
- A* Euclidean adds Euclidean-distance heuristic for comparison.

Movement rules:

- Movement is four-directional.
- Shelves cannot be crossed.
- Reading-area seats can only be entered when they are the target.
- Crowded cells are walkable with movement cost 2.

CSP pruning mode:

- Enabled when `constraintsEnabled` is `true`.
- `csp_path_domain()` builds an allowed-cell domain before each two-point search.
- The domain keeps cells whose `manhattan(start, cell) + manhattan(cell, target)` is within a detour margin.
- `prune_dead_end_cells()` removes non-start and non-target dead-end cells.
- If the pruned domain cannot produce a path, the code falls back to standard search and increments `fallbackSegments`.
- Returned CSP metrics include `originalCells`, `allowedCells`, `prunedCells`, `fallbackSegments`, and `cspRuntimeMs`.

Visit order strategies:

- Greedy Nearest Neighbor chooses the nearest next pickup point from the current position.
- Greedy + 2-opt starts with greedy order and improves total cost by reversing local segments.

## 6. Recommendation System

The recommendation system has offline training and online inference.

Offline training:

```bash
python3 backend/ml/train_recommender.py
```

Inputs:

- `books_10k.csv`: book metadata and text features.
- `interactions_10k.csv`: anonymized Goodreads user-book interactions.

Output:

```text
backend/data/models/recommender.joblib
```

The artifact contains:

- `book_ids` and `book_id_to_index` for model indexing.
- `item_factors` learned by `TruncatedSVD`.
- `tfidf_vectorizer` and `content_matrix` for content cold start.
- `metadata` with algorithm name, book count, user count, positive interaction count, and embedding dimension.

Online recommendation behavior:

- Anonymous users receive popular highly rated books and a sign-in prompt.
- Signed-in users with favorites receive SVD recommendations with `recommendation_method = svd_collaborative_filtering`.
- Signed-in users without favorites but with search history receive TF-IDF recommendations with `recommendation_method = content_cold_start`.
- Missing model, model load failure, or insufficient user signals return popularity fallback with `recommendation_method = popularity_fallback`.

The recommendation analysis API returns `ml_score`, `reason`, `recommendation_method`, `modelStatus`, profile keywords, preferred genres, and recommended books. The frontend shows recommendations, model status, and fallback notes; it no longer shows the old handcrafted content/collaborative/popularity/novelty score breakdown.

## 7. Startup and API

Recommended startup:

```bash
./setup.command
./start_server.command
```

Windows:

```bat
setup.bat
start_server.bat
```

The setup scripts create `.venv`, install `requirements.txt`, and ask whether to train the recommendation model. The start scripts require the local virtual environment and prompt the user to run setup if it is missing. If `127.0.0.1:8000` is occupied, the backend suggests another port, such as:

```bash
PORT=8001 python3 backend/server.py
```

Implemented API groups:

- Auth and users: `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/users/me/password`.
- Books and recommendations: `GET /api/books/search`, `GET /api/books/search-facets`, `GET /api/books/recommendations`.
- Favorites and history: `POST /api/books/{id}/favorite`, `DELETE /api/books/{id}/favorite`, `GET /api/users/me/search-history`, `GET /api/users/me/favorites`, `GET /api/favorites`.
- Map and routing: `GET /api/library-map`, `POST /api/pickup/solve`.
- Stats: `GET /api/stats`.

Not currently implemented:

- `/api/auth/logout`
- `GET /api/books/{id}`
- `POST /api/search-history`
- Separate `GET /api/users/me`

`GET /api/books/search` supports `keyword`, `record`, `genre`, `shelfTag`, `publisher`, `language`, `format`, `yearFrom`, `yearTo`, `minRating`, and `minRatingsCount`.

`GET /api/books/search-facets` currently returns the top 80 `genres` and top 80 `publishers`.

`POST /api/pickup/solve` accepts `bookIds`, `algorithm`, `method`, `end`, and `constraintsEnabled`. The response includes the chosen algorithm, method, distance, expanded-node counts, runtime, full path, segments, visit order, destination seat, and CSP metrics when enabled.

## 8. Frontend Structure

The frontend is a static single-page app controlled by `app.js`.

Pages:

- Sign-in/register page with demo account `demo / demo123`.
- Search page for search results, favorites, and recommendations.
- Pickup page with task controls, map, algorithm tools, metrics, route steps, and comparison modal.
- Profile page for user details, password changes, search history, and favorite books.

Pickup interactions:

- Add books from favorites or search results.
- Click a green reading-area cell to set the destination.
- Generate and play a route.
- Click a step to inspect only that segment.
- Open the expanded map modal.
- Open CSP, algorithm, step, and metric tool panels.
- Use the comparison modal to compare total cost, path nodes expanded, planner nodes expanded, runtime, and CSP preprocessing time.

## 9. Project Structure

```text
backend/
  ml/
    train_recommender.py
  server.py
  data/
    dataset/

frontend/
  static/
    index.html
    app.js
    styles.css

tests/
  test_*.py

setup.command
setup.bat
start_server.command
start_server.bat
```

Generated local files such as `.venv/`, `backend/data/library.db`, `backend/data/models/recommender.joblib`, `.DS_Store`, and compiled binaries should not be included in the coursework ZIP. The ZIP should include source code, Goodreads CSV data, README/docs, requirements, startup scripts, and tests.

Run the test suite with Python's built-in unittest runner:

```bash
.venv/bin/python -m unittest discover -s tests -p 'test_*.py'
```

## 10. Differences from Earlier Plans

- The map is `30 * 30`, not `24 * 24`.
- The current shelf count is 248, not 300.
- There is no fixed exit; the user selects a reading-area seat.
- There is no separate `library_map` table.
- The backend is not FastAPI, and the frontend is not React or Vue.
- Auth uses runtime memory tokens, not JWT.
- There is no admin role.
- There is no single-book detail API.
- There is no logout API.
- Recommendation training no longer imports raw interaction tables into SQLite.
- Search facets currently return only `genres` and `publishers`.

Future work should build on the current implementation rather than reviving older assumptions.

## 11. Demo Suggestions

For a course demo, highlight:

- The library as a weighted grid graph.
- How shelves and reading areas constrain walkability.
- How crowded cells distinguish shortest step count from lowest cost.
- BFS, UCS, A* Manhattan, and A* Euclidean comparisons.
- Greedy Nearest Neighbor versus Greedy + 2-opt for multi-target ordering.
- CSP pruning, fallback behavior, and reduced search space.
- SVD collaborative filtering learned from Goodreads interactions.
- TF-IDF cold start when the user has no favorites.
- Popularity fallback when the model is missing.

Suggested demo flow:

1. Sign in as `demo / demo123`.
2. Train the model with `python3 backend/ml/train_recommender.py` if full ML recommendations are needed.
3. Search for and favorite several books.
4. Open Pickup, add multiple books, and choose a reading-area seat.
5. Compare visit order algorithms and BFS, UCS, A* Manhattan, and A* Euclidean.
6. Open Algorithm Comparison.
7. Enable CSP pruning mode and compare standard mode with CSP mode.
