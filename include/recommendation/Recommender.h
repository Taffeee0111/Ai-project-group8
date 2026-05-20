#pragma once
// Purpose: High-level recommendation engine interface.

#include "core/LibraryCatalog.h"
#include "recommendation/RecommendationTypes.h"

#include <vector>

namespace ainav {

class Recommender {
 public:
  virtual ~Recommender() = default;
  virtual std::vector<Recommendation> recommendSimilar(const LibraryCatalog& catalog,
                                                       const BookId& seed_book,
                                                       std::size_t k) const = 0;
};

}  // namespace ainav

