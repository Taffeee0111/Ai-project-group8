// Purpose: DFS pathfinding stub. Implementation will be added later.

#include "search/DFS.h"

namespace ainav {

PathResult DFS::findPath(const GridMap& /*map*/, Point /*start*/, Point /*goal*/) const {
  // TODO: Implement DFS on GridMap (4-neighborhood) and reconstruct path.
  return PathResult{false, Path{}, 0, "DFS not implemented yet"};
}

}  // namespace ainav

