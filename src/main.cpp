// Purpose: Program entry point for quick manual verification of core components.
// Demonstrates:
// - 24x24 GridMap printing (0=walkable, 1=obstacle)
// - Neighbor generation
// - BFS shortest-path between two points (no A* yet)

#include "core/GridMap.h"
#include "search/BFS.h"
#include "search/DFS.h"

#include <iostream>
#include <vector>

int main() {
  ainav::GridMap map(24, 24);

  // Sample obstacles/bookshelves (each shelf is one (x,y) cell).
  // These are only for demo output; real shelves will come from CSV later.
  const std::vector<ainav::Point> sample_shelves = {
      {5, 6},   {6, 6},   {7, 6},   // a small block
      {12, 3},  {12, 4},  {12, 5},  {12, 6},  {12, 7},  // a vertical shelf line
      {18, 18}, {19, 18}, {20, 18}, {20, 19}, {20, 20}  // an L shape
  };
  for (ainav::Point p : sample_shelves) {
    map.setObstacle(p, true);
  }

  std::cout << "24x24 GridMap (0=walkable, 1=obstacle/bookshelf)\n";
  map.print(std::cout);

  // Quick neighbor generation demo (optional sanity check output).
  const ainav::Point probe{5, 5};
  const auto ns = map.neighbors4(probe, true);
  std::cout << "\nWalkable neighbors of (" << probe.x << "," << probe.y << "):";
  for (ainav::Point n : ns) {
    std::cout << " (" << n.x << "," << n.y << ")";
  }
  std::cout << "\n";

  // BFS shortest path demo.
  const ainav::Point start{0, 0};
  const ainav::Point goal{23, 23};
  ainav::BFS bfs;
  const ainav::PathResult r = bfs.findPath(map, start, goal);

  std::cout << "\nBFS result: " << (r.success ? "success" : "failure") << "\n";
  std::cout << "Path length (steps): " << r.cost << "\n";
  std::cout << "Path nodes: " << r.path.cells.size() << "\n";

  // DFS comparison (DFS is not guaranteed to be shortest).
  ainav::DFS dfs;
  const ainav::PathResult d = dfs.findPath(map, start, goal);
  std::cout << "\nDFS result: " << (d.success ? "success" : "failure") << "\n";
  std::cout << "Path length (steps): " << d.cost << "\n";
  std::cout << "Path nodes: " << d.path.cells.size() << "\n";

  return 0;
}
