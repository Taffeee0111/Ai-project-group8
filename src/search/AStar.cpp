// Purpose: A* pathfinding stub. Implementation will be added later.

#include "search/AStar.h"

namespace ainav {

PathResult AStar::findPath(const GridMap& /*map*/, Point /*start*/, Point /*goal*/) const {
  // TODO: Implement A* on GridMap using Manhattan heuristic; reconstruct path.
  return PathResult{false, Path{}, 0, "A* not implemented yet"};
}

}  // namespace ainav

