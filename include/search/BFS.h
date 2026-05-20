#pragma once
// Purpose: BFS pathfinding algorithm interface/placeholder (implementation to be added later).

#include "search/SearchAlgorithm.h"

namespace ainav {

class BFS final : public SearchAlgorithm {
 public:
  PathResult findPath(const GridMap& map, Point start, Point goal) const override;
};

}  // namespace ainav

