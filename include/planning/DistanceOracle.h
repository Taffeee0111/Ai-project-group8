#pragma once
// Purpose: Provides estimated/actual distances between points for visit-order planning.
// Later, this can be backed by Manhattan distance or real A* distances.

#include "core/GridMap.h"
#include "core/Types.h"

namespace ainav {

class DistanceOracle {
 public:
  virtual ~DistanceOracle() = default;
  virtual int distance(const GridMap& map, Point a, Point b) const = 0;
};

}  // namespace ainav

