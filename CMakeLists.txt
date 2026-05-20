cmake_minimum_required(VERSION 3.20)
project(ai_library_nav LANGUAGES CXX)

# Starter scaffold: algorithms are intentionally not implemented yet.
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

include(GNUInstallDirs)

add_library(core
  src/core/CsvIO.cpp
  src/core/GridMap.cpp
  src/core/LibraryCatalog.cpp
  src/core/Scenario.cpp
)
target_include_directories(core PUBLIC ${CMAKE_CURRENT_SOURCE_DIR}/include)

add_library(search
  src/search/BFS.cpp
  src/search/DFS.cpp
  src/search/AStar.cpp
)
target_link_libraries(search PUBLIC core)
target_include_directories(search PUBLIC ${CMAKE_CURRENT_SOURCE_DIR}/include)

add_library(planning
  src/planning/GreedyPlanner.cpp
  src/planning/BruteForcePlanner.cpp
  src/planning/CspPlanner.cpp
  src/planning/DistanceOracle.cpp
)
target_link_libraries(planning PUBLIC core search)
target_include_directories(planning PUBLIC ${CMAKE_CURRENT_SOURCE_DIR}/include)

add_library(recommendation
  src/recommendation/FeatureExtractor.cpp
  src/recommendation/CosineSimilarity.cpp
  src/recommendation/Recommender.cpp
  src/recommendation/RecommendationService.cpp
)
target_link_libraries(recommendation PUBLIC core)
target_include_directories(recommendation PUBLIC ${CMAKE_CURRENT_SOURCE_DIR}/include)

add_library(app
  src/app/LibraryNavigatorApp.cpp
)
target_link_libraries(app PUBLIC core recommendation planning search)
target_include_directories(app PUBLIC ${CMAKE_CURRENT_SOURCE_DIR}/include)

add_executable(library_nav src/main.cpp)
target_link_libraries(library_nav PRIVATE app)
set_target_properties(library_nav PROPERTIES RUNTIME_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/bin)

