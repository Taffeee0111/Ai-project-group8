// Purpose: Brute-force visit-order planner stub. Implementation will be added later.

#include "planning/BruteForcePlanner.h"

namespace ainav {

std::vector<Point> BruteForcePlanner::plan(const GridMap& /*map*/,
                                          Point /*start*/,
                                          const std::vector<Point>& /*targets*/,
                                          const DistanceOracle& /*oracle*/) const {
  // TODO: Implement permutation search for small N.
  return {};
}

}  // namespace ainav

