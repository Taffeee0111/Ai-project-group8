#pragma once
// Purpose: App-facing recommendation facade (wires catalog + recommender + feature extractor).

#include "core/LibraryCatalog.h"
#include "recommendation/Recommender.h"

#include <memory>

namespace ainav {

class RecommendationService {
 public:
  RecommendationService() = default;

  // Dependency injection: lets you swap algorithms without changing app code.
  void setRecommender(std::shared_ptr<Recommender> recommender);

  std::vector<Recommendation> recommend(const LibraryCatalog& catalog,
                                        const BookId& seed_book,
                                        std::size_t k) const;

 private:
  std::shared_ptr<Recommender> recommender_{};
};

}  // namespace ainav

