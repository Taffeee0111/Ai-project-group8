// Purpose: BFS pathfinding stub. Implementation will be added later.

#include "search/BFS.h"

namespace ainav {

PathResult BFS::findPath(const GridMap& /*map*/, Point /*start*/, Point /*goal*/) const {
  // TODO: Implement BFS on GridMap (4-neighborhood) and reconstruct path.
  return PathResult{false, Path{}, 0, "BFS not implemented yet"};
}

}  // namespace ainav

