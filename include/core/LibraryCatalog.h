#pragma once
// Purpose: Holds books + shelves; provides lookups and validation hooks for later layers.

#include "core/Book.h"
#include "core/Shelf.h"

#include <optional>
#include <unordered_map>
#include <vector>

namespace ainav {

class LibraryCatalog {
 public:
  // Loaders (CSV): stubs for now; file format is documented in data/README.md.
  bool loadBooksCsv(const std::string& path);
  bool loadShelvesCsv(const std::string& path);

  // Lookup helpers.
  const Book* findBook(const BookId& id) const;
  const Shelf* findShelf(const ShelfId& id) const;

  const std::vector<Book>& books() const;
  const std::vector<Shelf>& shelves() const;

 private:
  std::vector<Book> books_{};
  std::vector<Shelf> shelves_{};
  std::unordered_map<BookId, std::size_t> book_index_{};
  std::unordered_map<ShelfId, std::size_t> shelf_index_{};
};

}  // namespace ainav

