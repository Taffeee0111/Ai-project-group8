// Purpose: RecommendationService facade implementation (no algorithms here).

#include "recommendation/RecommendationService.h"

#include <stdexcept>

namespace ainav {

void RecommendationService::setRecommender(std::shared_ptr<Recommender> recommender) {
  recommender_ = std::move(recommender);
}

std::vector<Recommendation> RecommendationService::recommend(const LibraryCatalog& catalog,
                                                            const BookId& seed_book,
                                                            std::size_t k) const {
  if (!recommender_) {
    throw std::runtime_error("RecommendationService: recommender not set");
  }
  return recommender_->recommendSimilar(catalog, seed_book, k);
}

}  // namespace ainav

