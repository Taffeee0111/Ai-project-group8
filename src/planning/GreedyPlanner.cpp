// Purpose: Greedy visit-order planner stub. Implementation will be added later.

#include "planning/GreedyPlanner.h"

namespace ainav {

std::vector<Point> GreedyPlanner::plan(const GridMap& /*map*/,
                                      Point /*start*/,
                                      const std::vector<Point>& /*targets*/,
                                      const DistanceOracle& /*oracle*/) const {
  // TODO: Implement nearest-next greedy.
  return {};
}

}  // namespace ainav

