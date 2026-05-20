// Purpose: CSP-inspired planner stub. Implementation will be added later.

#include "planning/CspPlanner.h"

namespace ainav {

std::vector<Point> CspPlanner::plan(const GridMap& /*map*/,
                                   Point /*start*/,
                                   const std::vector<Point>& /*targets*/,
                                   const DistanceOracle& /*oracle*/) const {
  // TODO: Implement backtracking search with constraints/heuristics.
  return {};
}

}  // namespace ainav

