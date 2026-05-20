#pragma once
// Purpose: Greedy visit-order planner placeholder (nearest-next heuristic later).

#include "planning/VisitPlanner.h"

namespace ainav {

class GreedyPlanner final : public VisitPlanner {
 public:
  std::vector<Point> plan(const GridMap& map,
                          Point start,
                          const std::vector<Point>& targets,
                          const DistanceOracle& oracle) const override;
};

}  // namespace ainav

