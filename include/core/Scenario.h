#pragma once
// Purpose: Captures one run configuration: map + start + selected books to collect.

#include "core/Types.h"

#include <vector>

namespace ainav {

struct Scenario {
  Point start{};
  std::vector<BookId> selected_books{};
};

}  // namespace ainav

