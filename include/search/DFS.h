#pragma once
// Purpose: DFS pathfinding algorithm interface/placeholder (implementation to be added later).

#include "search/SearchAlgorithm.h"

namespace ainav {

class DFS final : public SearchAlgorithm {
 public:
  PathResult findPath(const GridMap& map, Point start, Point goal) const override;
};

}  // namespace ainav

