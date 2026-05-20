#pragma once
// Purpose: 24x24 grid map representation and obstacle queries (bookshelves are obstacles).

#include "core/Types.h"

#include <cstdint>
#include <iosfwd>
#include <vector>

namespace ainav {

class GridMap {
 public:
  GridMap(int width = 24, int height = 24);

  int width() const;
  int height() const;

  bool inBounds(Point p) const;
  bool isObstacle(Point p) const;
  bool isWalkable(Point p) const;
  void setObstacle(Point p, bool obstacle);

  // Returns 0 for walkable cells, 1 for obstacles/bookshelves.
  // Out-of-bounds is treated as 1 (not walkable).
  int cell(Point p) const;

  // 4-neighborhood (up/down/left/right) for grid-based navigation.
  // Returned points are guaranteed to be in-bounds; by default only walkable neighbors are included.
  std::vector<Point> neighbors4(Point p, bool walkable_only = true) const;

  // Prints a 0/1 grid:
  // - 0 = walkable cell
  // - 1 = obstacle/bookshelf
  void print(std::ostream& out) const;

 private:
  int width_{24};
  int height_{24};
  std::vector<std::uint8_t> cells_;  // row-major [y*width + x], values are 0/1

  int index(Point p) const;
};

}  // namespace ainav
