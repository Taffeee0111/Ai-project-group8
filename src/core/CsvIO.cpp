// Purpose: CSV helper implementation (intentionally minimal/stubbed for now).

#include "core/CsvIO.h"

#include <stdexcept>

namespace ainav {

std::vector<std::vector<std::string>> CsvIO::readAll(const std::string& /*path*/) {
  // TODO: Implement robust CSV parsing and error handling.
  // Keeping this stubbed so we don't implement project logic prematurely.
  throw std::runtime_error("CsvIO::readAll not implemented yet");
}

}  // namespace ainav

