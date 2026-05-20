#pragma once
// Purpose: Orchestrates recommendation + planning + search to produce a full collection route.
// Note: Algorithm implementations are intentionally left as TODO.

#include "core/LibraryCatalog.h"
#include "core/Scenario.h"

namespace ainav {

class LibraryNavigatorApp {
 public:
  LibraryNavigatorApp() = default;

  // Entry point for running a scenario (CLI/UI will call this later).
  // For now, this is a placeholder to define the integration seam.
  void run(const LibraryCatalog& catalog, const Scenario& scenario);
};

}  // namespace ainav

