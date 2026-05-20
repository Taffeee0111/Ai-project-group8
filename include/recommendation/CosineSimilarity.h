#pragma once
// Purpose: Cosine similarity metric placeholder (implementation to be added later).

#include "recommendation/SimilarityMetric.h"

namespace ainav {

class CosineSimilarity final : public SimilarityMetric {
 public:
  double similarity(const FeatureVector& a, const FeatureVector& b) const override;
};

}  // namespace ainav

