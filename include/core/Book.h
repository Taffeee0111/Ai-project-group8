#pragma once
// Purpose: Domain model for a book in the library catalog.

#include "core/Types.h"

#include <string>
#include <vector>

namespace ainav {

struct Book {
  BookId id;
  std::string title;
  std::string author;

  // Content-based features (initially from CSV keywords column).
  std::vector<std::string> keywords;

  // Physical location is represented by the shelf_id; the shelf's (x,y) lives in Shelf.
  ShelfId shelf_id;
};

}  // namespace ainav

