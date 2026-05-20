# AI Library Navigation & Recommendation System (C++)

University-style AI project scaffold with three layers:
1. Recommendation (content-based / cosine similarity)
2. Planning (greedy / brute force / CSP concepts)
3. Search (BFS / DFS / A* on a 24x24 grid)

Assumptions (from requirements):
- Dataset input is CSV.
- Each bookshelf is a single grid coordinate `(x, y)` and acts as an obstacle.
- Each bookshelf contains **5 books**.

## Build
```sh
cmake -S . -B build
cmake --build build
```

Run:
```sh
./build/bin/library_nav
```

## MinGW (manual compile)
If you're compiling/running with MinGW directly (without CMake), make sure the MinGW `bin` folder is on your `PATH`
or the executable may start with **no output** due to missing runtime DLLs.

Git Bash example:
```sh
export PATH=/d/mingw64/bin:$PATH
```

## Repo layout
- `include/` public headers (module APIs)
- `src/` implementations (currently stubs / TODOs)
- `data/` CSV format docs + example datasets
- `docs/` report notes / algorithm explanations
- `tests/` unit tests (to be added)
