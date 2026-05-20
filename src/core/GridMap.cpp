// Purpose: Implements GridMap storage and obstacle queries.

#include "core/GridMap.h"

#include <ostream>
#include <stdexcept>

namespace ainav {

GridMap::GridMap(int width, int height) : width_(width), height_(height) {
  if (width_ <= 0 || height_ <= 0) {
    throw std::invalid_argument("GridMap width/height must be positive");
  }
  cells_.assign(static_cast<std::size_t>(width_ * height_), 0);
}

int GridMap::width() const { return width_; }
int GridMap::height() const { return height_; }

bool GridMap::inBounds(Point p) const {
  return p.x >= 0 && p.x < width_ && p.y >= 0 && p.y < height_;
}

int GridMap::index(Point p) const { return p.y * width_ + p.x; }

bool GridMap::isObstacle(Point p) const {
  if (!inBounds(p)) return true;
  return cells_.at(static_cast<std::size_t>(index(p))) != 0;
}

bool GridMap::isWalkable(Point p) const { return inBounds(p) && !isObstacle(p); }

void GridMap::setObstacle(Point p, bool obstacle) {
  if (!inBounds(p)) return;
  cells_.at(static_cast<std::size_t>(index(p))) = obstacle ? 1 : 0;
}

int GridMap::cell(Point p) const {
  if (!inBounds(p)) return 1;
  return static_cast<int>(cells_.at(static_cast<std::size_t>(index(p))));
}

std::vector<Point> GridMap::neighbors4(Point p, bool walkable_only) const {
  if (!inBounds(p)) return {};

  std::vector<Point> candidates;
  candidates.reserve(4);
  candidates.push_back(Point{p.x + 1, p.y});
  candidates.push_back(Point{p.x - 1, p.y});
  candidates.push_back(Point{p.x, p.y + 1});
  candidates.push_back(Point{p.x, p.y - 1});

  std::vector<Point> result;
  result.reserve(4);
  for (Point c : candidates) {
    if (!inBounds(c)) continue;
    if (walkable_only && isObstacle(c)) continue;
    result.push_back(c);
  }
  return result;
}

void GridMap::print(std::ostream& out) const {
  for (int y = 0; y < height_; ++y) {
    for (int x = 0; x < width_; ++x) {
      const int v = static_cast<int>(cells_.at(static_cast<std::size_t>(y * width_ + x)));
      out << (v != 0 ? '1' : '0');
      if (x + 1 < width_) out << ' ';
    }
    out << '\n';
  }
}

}  // namespace ainav
