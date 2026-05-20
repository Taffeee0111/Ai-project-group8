// Purpose: Catalog load/lookups. Loading from CSV is stubbed for now.

#include "core/LibraryCatalog.h"

namespace ainav {

bool LibraryCatalog::loadBooksCsv(const std::string& /*path*/) {
  // TODO: Parse data/README.md format; build books_ and book_index_.
  return false;
}

bool LibraryCatalog::loadShelvesCsv(const std::string& /*path*/) {
  // TODO: Parse data/README.md format; build shelves_ and shelf_index_.
  return false;
}

const Book* LibraryCatalog::findBook(const BookId& id) const {
  auto it = book_index_.find(id);
  if (it == book_index_.end()) return nullptr;
  return &books_.at(it->second);
}

const Shelf* LibraryCatalog::findShelf(const ShelfId& id) const {
  auto it = shelf_index_.find(id);
  if (it == shelf_index_.end()) return nullptr;
  return &shelves_.at(it->second);
}

const std::vector<Book>& LibraryCatalog::books() const { return books_; }
const std::vector<Shelf>& LibraryCatalog::shelves() const { return shelves_; }

}  // namespace ainav

