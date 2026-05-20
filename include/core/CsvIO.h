#pragma once
// Purpose: Minimal CSV read/write helpers (parsing rules to be defined later).
// Note: This is NOT where AI algorithms live; it only supports loading datasets.

#include <string>
#include <vector>

namespace ainav {

class CsvIO {
 public:
  // Reads a CSV file into rows of columns. Implementation is intentionally minimal/stubbed for now.
  static std::vector<std::vector<std::string>> readAll(const std::string& path);
};

}  // namespace ainav

