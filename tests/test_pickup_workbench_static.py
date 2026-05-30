from pathlib import Path
import unittest


PROJECT_ROOT = Path(__file__).resolve().parents[1]
INDEX_HTML = PROJECT_ROOT / "frontend" / "static" / "index.html"
APP_JS = PROJECT_ROOT / "frontend" / "static" / "app.js"
STYLES_CSS = PROJECT_ROOT / "frontend" / "static" / "styles.css"
README_MD = PROJECT_ROOT / "README.md"
PLAN_MD = PROJECT_ROOT / "docs" / "library_borrowing_system_plan.md"


class PickupWorkbenchStaticTest(unittest.TestCase):
    def test_pickup_page_keeps_required_nodes_in_workbench_layout(self) -> None:
        html = INDEX_HTML.read_text(encoding="utf-8")

        self.assertIn('class="pickup-workbench"', html)
        self.assertIn('class="map-workspace"', html)
        self.assertIn('class="floating-tools"', html)
        self.assertIn('class="mobile-workbench-tabs"', html)
        for node_id in (
            "pickupSelection",
            "routeSteps",
            "libraryGrid",
            "algorithmSelect",
            "solverSelect",
            "pathMetrics",
            "algorithmCompareModal",
        ):
            self.assertIn(f'id="{node_id}"', html)

    def test_pickup_tools_are_collapsible_and_mobile_tabs_are_bound(self) -> None:
        html = INDEX_HTML.read_text(encoding="utf-8")
        script = APP_JS.read_text(encoding="utf-8")
        styles = STYLES_CSS.read_text(encoding="utf-8")

        self.assertIn('data-tool-toggle="algorithmTools"', html)
        self.assertIn('data-tool-toggle="routeStepsTools"', html)
        self.assertIn('data-tool-toggle="metricsTools"', html)
        self.assertIn('data-tool-action="compare"', html)
        self.assertIn('data-tool-action="expand-map"', html)
        self.assertIn('data-workbench-view="map"', html)
        self.assertIn("toggleWorkbenchTool", script)
        self.assertIn("setWorkbenchView", script)
        self.assertIn(".floating-tool-panel.collapsed", styles)
        self.assertIn(".pickup-workbench[data-mobile-view=\"tasks\"]", styles)

    def test_map_expand_button_sits_on_map_canvas(self) -> None:
        html = INDEX_HTML.read_text(encoding="utf-8")
        styles = STYLES_CSS.read_text(encoding="utf-8")
        pickup_page = html[html.index('<section class="page" id="pickupPage">') : html.index('<section class="page" id="profilePage">')]
        map_canvas = pickup_page[pickup_page.index('<div class="map-canvas">') : pickup_page.index('</div>', pickup_page.index('id="libraryGrid"'))]
        tool_rail = pickup_page[pickup_page.index('<div class="tool-rail"') : pickup_page.index('</div>', pickup_page.index('<div class="tool-rail"'))]
        map_canvas_start = styles.index(".map-canvas {")
        map_canvas_block = styles[map_canvas_start : styles.index(".map-expand-button {", map_canvas_start)]
        expand_button_block = styles[styles.index(".map-expand-button {") : styles.index(".map-expand-button:hover")]

        self.assertIn('id="openMapModal"', map_canvas)
        self.assertIn('class="map-expand-button"', map_canvas)
        self.assertIn('data-tool-action="expand-map"', map_canvas)
        self.assertNotIn('id="openMapModal"', tool_rail)
        self.assertIn("position: relative;", map_canvas_block)
        self.assertIn("position: absolute;", expand_button_block)
        self.assertIn("top: 8px;", expand_button_block)
        self.assertIn("right: 8px;", expand_button_block)
        self.assertIn("z-index: 8;", expand_button_block)

    def test_tool_rail_is_compact_labeled_segmented_control(self) -> None:
        html = INDEX_HTML.read_text(encoding="utf-8")
        styles = STYLES_CSS.read_text(encoding="utf-8")
        pickup_page = html[html.index('<section class="page" id="pickupPage">') : html.index('<section class="page" id="profilePage">')]
        tool_rail = pickup_page[pickup_page.index('<div class="tool-rail"') : pickup_page.index('</div>', pickup_page.index('<div class="tool-rail"'))]
        tool_workspace_start = styles.index(".tool-workspace {", styles.index(".map-canvas {"))
        tool_workspace_block = styles[tool_workspace_start : styles.index(".floating-tools {")]
        mobile_block = styles[styles.index("@media (max-width: 980px)") : styles.index("@media (max-height: 760px)")]
        rail_block = styles[styles.index(".tool-rail {") : styles.index(".tool-toggle-button {")]
        short_height_block = styles[styles.index("@media (max-height: 760px)") : styles.index("@media (max-width: 980px) and (max-height: 760px)")]
        button_block = styles[styles.index(".tool-toggle-button {") : styles.index(".tool-toggle-button:hover")]

        self.assertEqual(tool_rail.count('class="tool-toggle-button'), 4)
        self.assertEqual(tool_rail.count('class="tool-icon"'), 4)
        for label in ("算法", "步骤", "指标", "比较"):
            self.assertIn(f"<span>{label}</span>", tool_rail)
        self.assertNotIn('id="openMapModal"', tool_rail)
        self.assertIn("padding-top: 31px;", tool_workspace_block)
        self.assertIn("padding-top: 0;", mobile_block[mobile_block.index(".tool-workspace {") : mobile_block.index("}", mobile_block.index(".tool-workspace {"))])
        self.assertIn("width: 82px;", rail_block)
        self.assertIn("gap: 8px;", rail_block)
        self.assertIn("padding: 8px;", rail_block)
        self.assertIn("border-radius: 18px;", rail_block)
        self.assertIn("overflow: visible;", rail_block)
        self.assertIn("width: 100%;", button_block)
        self.assertIn("height: 58px;", button_block)
        self.assertIn("border: 1px solid rgba(196, 211, 218, 0.72);", button_block)
        self.assertIn("grid-template-columns: 1fr;", button_block)
        self.assertIn("gap: 8px;", short_height_block[short_height_block.index(".tool-rail {") : short_height_block.index("}", short_height_block.index(".tool-rail {"))])

    def test_left_sidebar_keeps_only_route_controls_and_book_selection(self) -> None:
        html = INDEX_HTML.read_text(encoding="utf-8")
        pickup_page = html[html.index('<section class="page" id="pickupPage">') : html.index('<section class="page" id="profilePage">')]
        self.assertIn('<aside class="tool-workspace"', pickup_page)
        sidebar = pickup_page[pickup_page.index('<section class="pickup-panel workbench-sidebar"') : pickup_page.index('<section class="map-workspace">')]
        map_workspace = pickup_page[pickup_page.index('<section class="map-workspace">') : pickup_page.index('<aside class="tool-workspace"')]

        self.assertIn('id="planButton"', sidebar)
        self.assertIn("<h2>本次取书</h2>", sidebar)
        self.assertIn('id="pickupSelection"', sidebar)
        self.assertNotIn("<h2>算法选择</h2>", sidebar)
        self.assertNotIn('id="algorithmSelect"', sidebar)
        self.assertNotIn('id="solverSelect"', sidebar)
        self.assertNotIn('id="routeSteps"', sidebar)
        self.assertIn('id="algorithmTools"', map_workspace)
        self.assertIn('id="algorithmSelect"', map_workspace)
        self.assertIn('id="solverSelect"', map_workspace)
        self.assertIn('id="routeSteps"', map_workspace)

    def test_sidebar_matches_map_height_and_route_controls_stack_navigation(self) -> None:
        html = INDEX_HTML.read_text(encoding="utf-8")
        styles = STYLES_CSS.read_text(encoding="utf-8")
        pickup_page = html[html.index('<section class="page" id="pickupPage">') : html.index('<section class="page" id="profilePage">')]
        controls = pickup_page[pickup_page.index('<div class="route-controls"') : pickup_page.index('</div>', pickup_page.index('<div class="route-control-actions"'))]
        workbench_block = styles[styles.index(".pickup-workbench {") : styles.index(".pickup-panel,")]
        panel_block = styles[styles.index(".pickup-panel {") : styles.index(".workbench-sidebar {")]
        pickup_selection_block = styles[styles.index(".pickup-selection {") : styles.index(".pickup-selection:has")]
        map_workspace_block = styles[styles.index(".map-workspace {") : styles.index(".algorithm-card {")]
        tool_workspace_start = styles.index(".tool-workspace {", styles.index(".map-canvas {"))
        tool_workspace_block = styles[tool_workspace_start : styles.index(".floating-tools {")]
        short_height_block = styles[styles.index("@media (max-height: 760px)") : styles.index("@media (max-width: 980px) and (max-height: 760px)")]
        controls_block = styles[styles.index(".route-controls {") : styles.index(".route-controls span")]
        control_actions_block = styles[styles.index(".route-control-actions {") : styles.index(".route-control-button {")]
        control_button_block = styles[styles.index(".route-control-button {") : styles.index(".route-control-button:hover")]

        self.assertIn("grid-template-columns: minmax(240px, 280px) minmax(0, 1fr) 82px;", workbench_block)
        self.assertIn("--pickup-map-size:", workbench_block)
        self.assertIn("--pickup-map-header-height:", workbench_block)
        self.assertIn("--pickup-map-gap:", workbench_block)
        self.assertIn("height: calc(var(--pickup-map-size) + var(--pickup-map-header-height) + var(--pickup-map-gap));", panel_block)
        self.assertIn("grid-template-rows: auto auto auto minmax(0, 1fr) auto;", panel_block)
        self.assertIn("overflow: hidden;", panel_block)
        self.assertNotIn("--pickup-selection-height", panel_block)
        self.assertNotIn("560px", panel_block)
        self.assertNotIn("100vh", panel_block)
        self.assertIn("height: 100%;", pickup_selection_block)
        self.assertIn("max-height: 100%;", pickup_selection_block)
        self.assertIn("overflow-y: auto;", pickup_selection_block)
        self.assertNotIn("--pickup-selection-height", pickup_selection_block)
        self.assertNotIn("560px", pickup_selection_block)
        self.assertNotIn("clamp(", pickup_selection_block)
        self.assertNotIn("vh", pickup_selection_block)
        self.assertIn("align-content: start;", map_workspace_block)
        self.assertNotIn("height: calc(100vh", map_workspace_block)
        self.assertNotIn("min-height: calc(100vh", map_workspace_block)
        self.assertIn("height: auto;", tool_workspace_block)
        self.assertNotIn("100vh", tool_workspace_block)
        self.assertIn("--pickup-map-size: calc(100vh - 158px);", short_height_block)
        self.assertIn("height: calc(var(--pickup-map-size) + var(--pickup-map-header-height) + var(--pickup-map-gap));", short_height_block)
        self.assertNotIn("height: auto;", short_height_block[short_height_block.index(".pickup-panel {") : short_height_block.index(".algorithm-card {")])
        self.assertLess(controls.index('id="previousRouteStep"'), controls.index('id="playRouteButton"'))
        self.assertLess(controls.index('id="playRouteButton"'), controls.index('id="nextRouteStep"'))
        self.assertIn("&lt;&lt;", controls)
        self.assertIn("▶", controls)
        self.assertIn("&gt;&gt;", controls)
        self.assertIn("grid-template-columns: 1fr;", controls_block)
        self.assertIn("grid-template-columns: repeat(3, minmax(0, 1fr));", control_actions_block)
        self.assertIn("justify-self: stretch;", control_actions_block)
        self.assertIn("width: 100%;", control_button_block)
        self.assertIn("height: 38px;", control_button_block)

    def test_map_is_dominant_and_tool_panels_overlay_map(self) -> None:
        styles = STYLES_CSS.read_text(encoding="utf-8")

        workbench_block = styles[styles.index(".pickup-workbench {") : styles.index(".pickup-panel,")]
        tools_block = styles[styles.index(".floating-tools {") : styles.index(".floating-tool-panel {")]
        panel_block = styles[styles.index(".floating-tool-panel {") : styles.index(".floating-tool-panel .tool-panel-body")]
        rail_block = styles[styles.index(".tool-rail {") : styles.index(".tool-toggle-button {")]
        button_block = styles[styles.index(".tool-toggle-button {") : styles.index(".tool-toggle-button:hover")]

        self.assertIn("grid-template-columns: minmax(240px, 280px) minmax(0, 1fr) 82px;", workbench_block)
        self.assertIn("position: absolute;", tools_block)
        self.assertIn("right: 12px;", tools_block)
        self.assertIn("z-index: 12;", tools_block)
        self.assertIn("width: min(280px, 34vw);", tools_block)
        self.assertIn("backdrop-filter: blur(14px);", panel_block)
        self.assertIn("gap: 8px;", rail_block)
        self.assertIn("width: 100%;", button_block)
        self.assertIn("height: 58px;", button_block)

    def test_pickup_selection_uses_full_book_cards(self) -> None:
        script = APP_JS.read_text(encoding="utf-8")

        render_block = script[script.index("function renderPickupSelection()") : script.index("function toggleAddBookMenu")]
        self.assertNotIn("visiblePickupBooks", render_block)
        self.assertNotIn("pickup-overflow-indicator", render_block)
        self.assertNotIn("show all", render_block)
        self.assertIn("book.author", render_block)
        self.assertIn("book.category", render_block)
        self.assertIn("book.shelf_id", render_block)

    def test_multi_algorithm_compare_is_separate_from_algorithm_metrics(self) -> None:
        html = INDEX_HTML.read_text(encoding="utf-8")
        pickup_page = html[html.index('<section class="page" id="pickupPage">') : html.index('<section class="page" id="profilePage">')]
        self.assertIn('data-tool-action="compare"', pickup_page)
        metrics_panel = pickup_page[pickup_page.index('id="metricsTools"') : pickup_page.index('data-tool-action="compare"')]

        self.assertIn("<h2>算法指标</h2>", metrics_panel)
        self.assertNotIn("多算法比较", metrics_panel)
        self.assertIn('aria-label="多算法比较"', pickup_page)

    def test_removed_pickup_features_are_not_exposed(self) -> None:
        html = INDEX_HTML.read_text(encoding="utf-8")
        script = APP_JS.read_text(encoding="utf-8")
        styles = STYLES_CSS.read_text(encoding="utf-8")

        self.assertNotIn("branch_bound", html)
        self.assertNotIn("branch_bound", script)
        self.assertNotIn("分支限界", html)
        self.assertNotIn("分支限界", script)
        self.assertNotIn("state_astar", html)
        self.assertNotIn("state_astar", script)
        self.assertNotIn("状态空间 A*", html)
        self.assertNotIn("状态空间 A*", script)

        removed_words = {
            "toggle_id": "id=\"" + "con" + "straints" + "Toggle\"",
            "enabled": "con" + "straints" + "Enabled",
            "toggle": "con" + "straints" + "Toggle",
            "stats": "con" + "straint" + "Stats",
            "saved": "path" + "Queries" + "Saved",
            "baseline": "path" + "Queries" + "Baseline",
            "executed": "path" + "Queries" + "Executed",
            "runtime_a": "c" + "sp" + "RuntimeMs",
            "path_runtime": "path" + "Search" + "RuntimeMs",
            "precompute": "precompute" + "Expanded",
            "timing": "timing" + "MetricsHtml",
            "runtime_text": "c" + "sp" + "RuntimeText",
            "path_runtime_text": "path" + "RuntimeText",
            "segment_runtime": "sum" + "Segment" + "Runtime",
            "toggle_class": "con" + "straint" + "-toggle",
            "candidate_prune": "候选边" + "压缩",
            "propagation": "约" + "束" + "传播",
            "path_queries": "路径" + "查询",
            "stats_label": "C" + "SP" + " 削减",
        }
        removed_terms = [
            removed_words["toggle_id"],
            removed_words["enabled"],
            removed_words["toggle"],
            removed_words["stats"],
            removed_words["saved"],
            removed_words["baseline"],
            removed_words["executed"],
            removed_words["runtime_a"],
            removed_words["path_runtime"],
            removed_words["precompute"],
            removed_words["timing"],
            removed_words["runtime_text"],
            removed_words["path_runtime_text"],
            removed_words["segment_runtime"],
            removed_words["toggle_class"],
            removed_words["candidate_prune"],
            removed_words["propagation"],
            removed_words["path_queries"],
            removed_words["stats_label"],
        ]
        for term in removed_terms:
            self.assertNotIn(term, html)
            self.assertNotIn(term, script)
            self.assertNotIn(term, styles)

        metrics_block = script[script.index('qs("#pathMetrics").innerHTML') : script.index("renderRouteSteps();", script.index('qs("#pathMetrics").innerHTML'))]
        self.assertIn("底层路径扩展", metrics_block)
        self.assertIn("整体规划扩展", metrics_block)

    def test_pickup_docs_no_longer_advertise_state_astar(self) -> None:
        docs = README_MD.read_text(encoding="utf-8") + PLAN_MD.read_text(encoding="utf-8")

        self.assertNotIn("state_astar", docs)
        self.assertNotIn("状态空间 A*", docs)

    def test_map_workspace_removes_redundant_title_overlay(self) -> None:
        html = INDEX_HTML.read_text(encoding="utf-8")
        pickup_page = html[html.index('<section class="page" id="pickupPage">') : html.index('<section class="page" id="profilePage">')]

        self.assertNotIn("map-workspace-title", pickup_page)
        self.assertNotIn("点击绿色阅读区选择终点座位", pickup_page)

    def test_map_legend_is_positioned_above_map(self) -> None:
        html = INDEX_HTML.read_text(encoding="utf-8")
        styles = STYLES_CSS.read_text(encoding="utf-8")
        self.assertIn('class="map-stage"', html)
        self.assertIn(".map-stage {", styles)

        legend_block = styles[styles.index(".map-legend-overlay {") : styles.index(".map-canvas {")]
        stage_block = styles[styles.index(".map-stage {") : styles.index(".map-legend-overlay {")]
        rail_block = styles[styles.index(".tool-rail {") : styles.index(".tool-toggle-button {")]

        self.assertIn("width: min(100%, var(--pickup-map-size));", stage_block)
        self.assertIn("grid-template-rows: var(--pickup-map-header-height) var(--pickup-map-size);", stage_block)
        self.assertIn("gap: var(--pickup-map-gap);", stage_block)
        self.assertIn("position: static;", legend_block)
        self.assertIn("width: 100%;", legend_block)
        self.assertIn("max-width: none;", legend_block)
        self.assertIn("box-shadow: none;", legend_block)
        self.assertIn("backdrop-filter: none;", legend_block)
        self.assertNotIn("bottom: 16px;", legend_block)
        self.assertNotIn("top: 16px;", legend_block)
        self.assertNotIn("rgba(255, 255, 255, 0.88)", legend_block)
        self.assertNotIn("calc(100% - 300px)", legend_block)
        self.assertNotIn("padding-top:", rail_block)
