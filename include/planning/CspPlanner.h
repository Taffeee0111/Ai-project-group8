#pragma once
// Purpose: CSP-inspired visit-order planner placeholder (backtracking + constraints later).

#include "planning/VisitPlanner.h"

namespace ainav {

class CspPlanner final : public VisitPlanner {
 public:
  std::vector<Point> plan(const GridMap& map,
                          Point start,
                          const std::vector<Point>& targets,
                          const DistanceOracle& oracle) const override;
};

}  // namespace ainav

