# Intelligent Library Borrowing System

This project is a prototype library borrowing website for `DI22001 - Algorithms and Artificial Intelligence AI Project`. It includes user authentication, book search, personalized recommendations, favorites, a profile page, and multi-target in-library pickup route planning focused on algorithm demonstration.

The current implementation is a Python standard-library backend, SQLite, and a static frontend. It does not use FastAPI, React, Vue, or a frontend build pipeline. The recommendation system uses an optional offline-trained classical machine learning model; when the model is missing, the site still works and falls back to popular highly rated books.

## Team Members

- Ruizhe Yang (2666039)
- Kefu Deng (2665826)
- Jingsong She (2666028)
- Kuoyu Li (2666019)
- Sihao Xiong (2666056)

## Features

- Register and sign in.
- Change password after signing in.
- Search the Goodreads 10k dataset and filter by genre, publisher, year, average rating, and ratings count.
- Load search facets so the frontend can populate common genre and publisher options.
- Generate personalized recommendations with an offline-trained SVD collaborative-filtering model; use TF-IDF content cold start when the user has search history but no favorites; fall back to popular highly rated books when needed.
- Favorite books and view them in the profile page.
- Build a pickup list from favorites or search results.
- Plan routes on a `30 * 30` library map from the entrance, through target shelves, to a selected reading-area seat.
- Model shelves, reading areas, crowded areas, and the entrance. Shelves and reading areas are blocked except for the selected destination seat; crowded cells are walkable with a movement cost of 2.
- Compare BFS, Uniform Cost Search, A* Manhattan, and A* Euclidean as two-point path algorithms.
- Compare Greedy Nearest Neighbor and Greedy + 2-opt as visit order algorithms.
- Enable optional CSP pruning mode for two-point path search, with fallback to standard search when pruning is too restrictive.
- Visualize the map, play route animations, highlight route steps, expand the map, view algorithm metrics, and compare algorithms in a modal.

## Data

The repository includes the processed dataset CSV files, but not the generated local SQLite database:

```text
backend/data/dataset/books_10k.csv
backend/data/dataset/interactions_10k.csv
```

### Dataset provenance and permitted use

The submitted CSV files are processed academic-use subsets derived from two related Goodreads data sources:

- **Book selection:** the 10,000 popular-book selection follows Zygmunt Zajac's
  [Goodbooks-10k](https://github.com/zygmuntz/goodbooks-10k) dataset. Its repository
  is licensed under
  [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).
- **Detailed metadata and interactions:** book metadata, public shelf tags, and
  anonymized user-book interactions were derived from the
  [UCSD Goodreads Book Graph](https://cseweb.ucsd.edu/~jmcauley/datasets/goodreads.html),
  collected by Mengting Wan and Julian McAuley's research group. The source page
  states that the data is for academic use only and must not be redistributed or
  used commercially.

`books_10k.csv` combines the selected book IDs with processed metadata and inferred
genre labels. `interactions_10k.csv` is a filtered sample of the UCSD interaction
data, capped at 500 retained interactions per selected book. User identifiers remain
anonymized. `estimated_word_count` is a project-derived field calculated as
`num_pages * 275`; it is not an original Goodreads field.

Because the UCSD source restricts redistribution, do not publish or commercially
redistribute the derived CSV files without confirming permission. Their inclusion in
coursework should remain within the institution's academic submission process.
See `backend/data/dataset/README.md` for citation-ready references and detailed
processing notes.

On first backend startup, `backend/server.py` creates:

```text
backend/data/library.db
```

`library.db` is generated locally and ignored by Git. If the database does not exist, `init_db()` creates the schema and imports 10,000 books from `books_10k.csv`. If it already exists, startup preserves users, favorites, and search history while applying idempotent migrations and metadata updates. `interactions_10k.csv` is used only for offline recommendation training.

The backend derives the project root from the location of `backend/server.py`, so the project can be moved without depending on machine-specific absolute paths.

The current map generates `248` shelf cells from `SHELF_GROUPS`. All 10,000 books are assigned cyclically to those real shelf cells and keep the `shelf_id` and `shelf_slot` needed for route planning.

## Machine Learning Recommendations

The recommendation system uses offline training plus online inference:

- Training script: `backend/ml/train_recommender.py`
- Training data: `books_10k.csv` and `interactions_10k.csv`
- Collaborative-filtering model: `scikit-learn` `TruncatedSVD`
- Content cold-start model: `TfidfVectorizer`
- Model artifact: `backend/data/models/recommender.joblib`

Install training dependencies:

```bash
python3 -m pip install -r requirements.txt
```

Train the model:

```bash
python3 backend/ml/train_recommender.py
```

After training, the script prints the model path, book count, user count, positive interaction count, embedding dimension, and basic similarity metrics. `recommender.joblib` is generated locally and ignored by Git. Search, authentication, favorites, and pickup route planning still work without ML dependencies or a trained model; only full SVD / TF-IDF recommendations are affected.

Online recommendation flow:

- Signed-in user with favorites: build a user vector from favorite book SVD embeddings and return similar books with `recommendation_method` set to `svd_collaborative_filtering`.
- Signed-in user with search history but no favorites: use recent search terms in TF-IDF content space with `recommendation_method` set to `content_cold_start`.
- Missing model, load failure, or insufficient user signals: return popular highly rated books with `recommendation_method` set to `popularity_fallback`.

## Startup

New users should run the setup script first. It creates `.venv`, installs `requirements.txt`, and asks whether to train the recommendation model immediately. Training can be skipped; the system will still start and show fallback recommendations.

macOS/Linux:

```bash
./setup.command
./start_server.command
```

Windows:

```bat
setup.bat
start_server.bat
```

The Windows setup script tries `python` first and falls back to `py -3`.

After startup, open:

```text
http://127.0.0.1:8000
```

The first startup creates `backend/data/library.db` and imports books from the Goodreads CSV. The terminal prints database preparation and import progress; the import may take a short while.

If port `8000` is in use, stop the program using that port or start on another port:

```bash
PORT=8001 python3 backend/server.py
```

You can also run the backend directly:

```bash
python3 backend/server.py
```

Do not open `frontend/static/index.html` directly in the browser, because the static file will not be able to call the backend API.

To regenerate the database, stop the backend and delete:

```text
backend/data/library.db
```

Then run:

```bash
python3 backend/server.py
```

To regenerate the recommendation model, delete or overwrite:

```text
backend/data/models/recommender.joblib
```

Then run:

```bash
python3 backend/ml/train_recommender.py
```

Demo account:

```text
username: demo
password: demo123
```

## Submission Notes

This submission contains the source code, the two Goodreads CSV files used by the application and recommender training, dataset notes, startup scripts, and Python requirements. Local generated files such as `.venv/`, `backend/data/library.db`, `backend/data/models/recommender.joblib`, `.DS_Store`, and compiled binaries are intentionally excluded.

## API Summary

Main implemented endpoints:

```text
POST /api/auth/register
POST /api/auth/login
GET  /api/auth/me
POST /api/users/me/password
GET  /api/books/search
GET  /api/books/search-facets
GET  /api/books/recommendations
POST /api/books/{id}/favorite
DELETE /api/books/{id}/favorite
GET  /api/users/me/search-history
GET  /api/users/me/favorites
GET  /api/favorites
GET  /api/library-map
POST /api/pickup/solve
GET  /api/stats
```

The current code does not implement `/api/auth/logout`, `GET /api/books/{id}`, `POST /api/search-history`, or a separate `GET /api/users/me`; profile information is returned by `GET /api/auth/me`.

`GET /api/books/search` supports:

- `keyword`
- `record`
- `genre`
- `shelfTag`
- `publisher`
- `language`
- `format`
- `yearFrom`
- `yearTo`
- `minRating`
- `minRatingsCount`

The frontend currently uses `keyword`, `record`, `genre`, `publisher`, `yearFrom`, `yearTo`, `minRating`, and `minRatingsCount`; the backend also keeps `shelfTag`, `language`, and `format` filtering.

`POST /api/pickup/solve` accepts:

```json
{
  "bookIds": [1, 2, 3],
  "algorithm": "astar_manhattan",
  "method": "greedy_2opt",
  "end": [10, 10],
  "constraintsEnabled": true
}
```

`algorithm` can be `bfs`, `ucs`, `astar_manhattan`, or `astar_euclidean`. `method` can be `greedy` or `greedy_2opt`. `end` is the reading-area seat selected by the user. When `constraintsEnabled` is `true`, CSP pruning mode is enabled and the response includes `constraintsEnabled` and `constraintStats`.

## Project Structure

```text
backend/
  ml/
    train_recommender.py   # Offline SVD + TF-IDF recommendation training
  server.py                # HTTP API, SQLite initialization, recommendations, map, and path algorithms
  data/
    dataset/
      README.md
      books_10k.csv        # Book metadata used at runtime and during model training
      interactions_10k.csv # User-book interactions used during model training
      interactions_summary.md

frontend/
  static/
    index.html
    app.js
    styles.css
setup.command              # macOS/Linux setup
setup.bat                  # Windows setup
start_server.command       # macOS/Linux local server startup
start_server.bat           # Windows local server startup
```
