#pragma once
// Purpose: Common interface for selecting an order to visit multiple target shelves/books.

#include "core/GridMap.h"
#include "core/Types.h"
#include "planning/DistanceOracle.h"

#include <vector>

namespace ainav {

class VisitPlanner {
 public:
  virtual ~VisitPlanner() = default;

  // Input: start position + target points. Output: target points ordered for visiting.
  virtual std::vector<Point> plan(const GridMap& map,
                                 Point start,
                                 const std::vector<Point>& targets,
                                 const DistanceOracle& oracle) const = 0;
};

}  // namespace ainav

