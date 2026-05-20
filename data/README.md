# CSV Data Formats

This project uses CSV inputs (simple, easy to edit in Excel).

## `books.csv`
Each row is one book.

Suggested columns:
- `book_id` (string, unique)
- `title` (string)
- `author` (string)
- `description` (string; free text)
- `keywords` (string; e.g. `ai|ml|search`)
- `shelf_id` (string; maps the book to a shelf)

## `shelves.csv`
Each row is one bookshelf.

Rules:
- Each shelf occupies exactly one coordinate `(x, y)` on the 24x24 grid.
- Each shelf is an obstacle cell in the map.
- Each shelf contains **5 books** (enforced at validation time later).

Suggested columns:
- `shelf_id` (string, unique)
- `x` (int)
- `y` (int)

## `map_24x24.csv` (optional)
If you prefer to store a full grid, store one row per `y` with 24 integers per row:
- `0` = free
- `1` = obstacle

If you use `shelves.csv` only, the map can be derived by marking shelf cells as obstacles.
