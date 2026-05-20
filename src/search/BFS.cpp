// Purpose: Breadth-First Search (BFS) shortest-path pathfinding on an unweighted grid.
//
// Requirements this file satisfies:
// - Uses a queue (FIFO) to explore the grid in layers.
// - Avoids obstacles/bookshelves (cells with value 1).
// - Returns the shortest path (fewest steps) between two points when one exists.
// - Returns the path and its length (number of moves).
// - Prints explored node count for visibility/debugging.

#include "search/BFS.h"

#include <algorithm>
#include <cstddef>
#include <iostream>
#include <queue>
#include <vector>

namespace ainav {

namespace {

int toIndex(int width, Point p) { return p.y * width + p.x; }

Point toPoint(int width, int index) { return Point{index % width, index / width}; }

Path reconstructPath(int width, int start_index, int goal_index, const std::vector<int>& parent) {
  // Trace parents from goal -> start, then reverse.
  std::vector<Point> reversed;
  for (int at = goal_index; at != start_index; at = parent.at(static_cast<std::size_t>(at))) {
    reversed.push_back(toPoint(width, at));
  }
  reversed.push_back(toPoint(width, start_index));

  std::reverse(reversed.begin(), reversed.end());
  return Path{std::move(reversed)};
}

}  // namespace

PathResult BFS::findPath(const GridMap& map, Point start, Point goal) const {
  // Basic validation up-front.
  if (!map.inBounds(start) || !map.inBounds(goal)) {
    return PathResult{false, Path{}, 0, "Start or goal is out of bounds"};
  }
  if (!map.isWalkable(start) || !map.isWalkable(goal)) {
    return PathResult{false, Path{}, 0, "Start or goal is not walkable (obstacle)"};
  }

  if (start.x == goal.x && start.y == goal.y) {
    // Trivial case: already at goal.
    Path p;
    p.cells.push_back(start);
    std::cout << "BFS explored nodes: 1\n";
    return PathResult{true, std::move(p), 0, "Start equals goal"};
  }

  const int width = map.width();
  const int total = width * map.height();

  // parent[i] stores the previous cell index on the discovered shortest path tree.
  // -1 means "undiscovered". We store start_index as its own parent sentinel.
  std::vector<int> parent(static_cast<std::size_t>(total), -1);
  std::vector<unsigned char> visited(static_cast<std::size_t>(total), 0);

  std::queue<int> q;

  const int start_index = toIndex(width, start);
  const int goal_index = toIndex(width, goal);

  visited[static_cast<std::size_t>(start_index)] = 1;
  parent[static_cast<std::size_t>(start_index)] = start_index;
  q.push(start_index);

  int explored = 0;  // number of dequeued/expanded nodes

  while (!q.empty()) {
    const int current_index = q.front();
    q.pop();
    ++explored;

    if (current_index == goal_index) {
      break;  // Found the goal; BFS guarantees this is the shortest (fewest edges) path.
    }

    const Point current = toPoint(width, current_index);
    for (Point next : map.neighbors4(current, /*walkable_only=*/true)) {
      const int next_index = toIndex(width, next);
      const std::size_t ni = static_cast<std::size_t>(next_index);
      if (visited[ni]) continue;

      visited[ni] = 1;                                   // mark BEFORE enqueue to avoid duplicates
      parent[ni] = current_index;                         // record how we reached this node
      q.push(next_index);                                 // FIFO queue => layer-by-layer exploration
    }
  }

  std::cout << "BFS explored nodes: " << explored << "\n";

  if (!visited[static_cast<std::size_t>(goal_index)]) {
    return PathResult{false, Path{}, 0, "No path found"};
  }

  Path path = reconstructPath(width, start_index, goal_index, parent);
  const int steps = static_cast<int>(path.cells.size()) - 1;  // edges/moves
  return PathResult{true, std::move(path), steps, "OK"};
}

}  // namespace ainav
