#pragma once
// Purpose: Shared, lightweight types used across all modules (core/recommendation/planning/search/app).

#include <string>
#include <vector>

namespace ainav {

using BookId = std::string;
using ShelfId = std::string;

struct Point {
  int x{};
  int y{};
};

struct Path {
  // Grid cells in visiting order (start..goal).
  std::vector<Point> cells;
};

struct PathResult {
  bool success{false};
  Path path{};
  int cost{0};  // typically number of steps
  std::string message{};
};

}  // namespace ainav

