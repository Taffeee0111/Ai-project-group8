#pragma once
// Purpose: Domain model for a bookshelf; occupies a single obstacle cell and holds multiple books.

#include "core/Types.h"

namespace ainav {

struct Shelf {
  ShelfId id;
  Point location{};

  // Note: each shelf contains 5 books (validated later in catalog/scenario validation).
};

}  // namespace ainav

