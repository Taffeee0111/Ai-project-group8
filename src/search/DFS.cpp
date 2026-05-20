// Purpose: Depth-First Search (DFS) pathfinding on a grid.
//
// Notes:
// - DFS is NOT guaranteed to return the shortest path.
// - We still reconstruct and return a valid path if one is found.
// - We print explored node count to compare behavior with BFS.

#include "search/DFS.h"

#include <algorithm>
#include <cstddef>
#include <iostream>
#include <vector>

namespace ainav {

namespace {

int toIndex(int width, Point p) { return p.y * width + p.x; }

Point toPoint(int width, int index) { return Point{index % width, index / width}; }

Path reconstructPath(int width, int start_index, int goal_index, const std::vector<int>& parent) {
  std::vector<Point> reversed;
  for (int at = goal_index; at != start_index; at = parent.at(static_cast<std::size_t>(at))) {
    reversed.push_back(toPoint(width, at));
  }
  reversed.push_back(toPoint(width, start_index));

  std::reverse(reversed.begin(), reversed.end());
  return Path{std::move(reversed)};
}

}  // namespace

PathResult DFS::findPath(const GridMap& map, Point start, Point goal) const {
  if (!map.inBounds(start) || !map.inBounds(goal)) {
    return PathResult{false, Path{}, 0, "Start or goal is out of bounds"};
  }
  if (!map.isWalkable(start) || !map.isWalkable(goal)) {
    return PathResult{false, Path{}, 0, "Start or goal is not walkable (obstacle)"};
  }

  if (start.x == goal.x && start.y == goal.y) {
    Path p;
    p.cells.push_back(start);
    std::cout << "DFS explored nodes: 1\n";
    return PathResult{true, std::move(p), 0, "Start equals goal"};
  }

  const int width = map.width();
  const int total = width * map.height();

  std::vector<int> parent(static_cast<std::size_t>(total), -1);
  std::vector<unsigned char> visited(static_cast<std::size_t>(total), 0);

  // Iterative DFS using a stack for determinism and to avoid recursion depth issues.
  std::vector<int> stack;
  stack.reserve(static_cast<std::size_t>(total));

  const int start_index = toIndex(width, start);
  const int goal_index = toIndex(width, goal);

  visited[static_cast<std::size_t>(start_index)] = 1;
  parent[static_cast<std::size_t>(start_index)] = start_index;
  stack.push_back(start_index);

  int explored = 0;  // number of popped/expanded nodes

  while (!stack.empty()) {
    const int current_index = stack.back();
    stack.pop_back();
    ++explored;

    if (current_index == goal_index) break;

    const Point current = toPoint(width, current_index);

    // Expand neighbors. The order affects which path DFS discovers first.
    for (Point next : map.neighbors4(current, /*walkable_only=*/true)) {
      const int next_index = toIndex(width, next);
      const std::size_t ni = static_cast<std::size_t>(next_index);
      if (visited[ni]) continue;

      visited[ni] = 1;
      parent[ni] = current_index;
      stack.push_back(next_index);
    }
  }

  std::cout << "DFS explored nodes: " << explored << "\n";

  if (!visited[static_cast<std::size_t>(goal_index)]) {
    return PathResult{false, Path{}, 0, "No path found"};
  }

  Path path = reconstructPath(width, start_index, goal_index, parent);
  const int steps = static_cast<int>(path.cells.size()) - 1;
  return PathResult{true, std::move(path), steps, "OK"};
}

}  // namespace ainav
