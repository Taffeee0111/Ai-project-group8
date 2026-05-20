#pragma once
// Purpose: Convert a Book into a numeric feature vector for content-based similarity.

#include "core/Book.h"

#include <vector>

namespace ainav {

using FeatureVector = std::vector<double>;

class FeatureExtractor {
 public:
  virtual ~FeatureExtractor() = default;
  virtual FeatureVector featurize(const Book& book) const = 0;
};

}  // namespace ainav

