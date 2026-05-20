# Architecture Overview (Scaffold)

This repo is structured as small C++ libraries that map to the project layers.

## Modules
- `core/`: domain models (Book/Shelf), `GridMap`, scenarios, CSV helpers
- `recommendation/`: content-based recommendation interfaces (cosine similarity later)
- `planning/`: visit-order optimization interfaces (greedy/brute/CSP later)
- `search/`: grid pathfinding interfaces (BFS/DFS/A* later)
- `app/`: orchestration glue to achieve the system goal (“shortest route to collect all selected books”)

## Dependency direction
`app` depends on everything; algorithms depend on `core`; `planning` may depend on `search` for accurate distances.

Algorithm implementations are intentionally left as TODO in this scaffold.

