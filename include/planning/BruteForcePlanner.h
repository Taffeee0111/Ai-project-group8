#pragma once
// Purpose: Brute-force visit-order planner placeholder (exact for small N later).

#include "planning/VisitPlanner.h"

namespace ainav {

class BruteForcePlanner final : public VisitPlanner {
 public:
  std::vector<Point> plan(const GridMap& map,
                          Point start,
                          const std::vector<Point>& targets,
                          const DistanceOracle& oracle) const override;
};

}  // namespace ainav

