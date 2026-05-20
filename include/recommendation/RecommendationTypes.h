#pragma once
// Purpose: Recommendation-layer data types (scores, results).

#include "core/Types.h"

#include <string>

namespace ainav {

struct Recommendation {
  BookId book_id;
  double score{0.0};
};

}  // namespace ainav

