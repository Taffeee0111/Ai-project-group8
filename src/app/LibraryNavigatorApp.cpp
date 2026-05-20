// Purpose: High-level system orchestration stub (recommendation + planning + search).

#include "app/LibraryNavigatorApp.h"

#include <iostream>

namespace ainav {

void LibraryNavigatorApp::run(const LibraryCatalog& /*catalog*/, const Scenario& /*scenario*/) {
  // TODO: Wire together:
  // - pick visit order for selected books
  // - run pathfinding for each leg
  // - aggregate route + total cost
  std::cout << "LibraryNavigatorApp::run is not implemented yet.\n";
}

}  // namespace ainav

