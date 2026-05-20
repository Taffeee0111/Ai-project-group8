#pragma once
// Purpose: Common interface for grid pathfinding algorithms (BFS/DFS/A*).

#include "core/GridMap.h"
#include "core/Types.h"

namespace ainav {

class SearchAlgorithm {
 public:
  virtual ~SearchAlgorithm() = default;
  virtual PathResult findPath(const GridMap& map, Point start, Point goal) const = 0;
};

}  // namespace ainav

