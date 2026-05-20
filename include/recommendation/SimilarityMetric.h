#pragma once
// Purpose: Defines how similarity between two feature vectors is computed (e.g., cosine similarity).

#include "recommendation/FeatureExtractor.h"

namespace ainav {

class SimilarityMetric {
 public:
  virtual ~SimilarityMetric() = default;
  virtual double similarity(const FeatureVector& a, const FeatureVector& b) const = 0;
};

}  // namespace ainav

