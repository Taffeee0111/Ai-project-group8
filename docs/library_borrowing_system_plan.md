# 图书馆智能借阅系统实现文档

本文档根据当前代码整理，若文档与代码存在差异，以代码为准。当前核心代码位于 `backend/server.py`、`frontend/static/index.html`、`frontend/static/app.js` 和 `frontend/static/styles.css`。

## 1. 当前实现概览

本项目是一个用于课程展示的图书馆智能借阅网站原型，主线是“多目标取书路径规划与搜索策略比较”，支撑功能包括登录注册、图书搜索、收藏、个人中心和个性化推荐。

当前技术结构：

- 后端：Python 标准库 `http.server`，入口为 `backend/server.py`。
- 数据库：SQLite，数据库文件为 `backend/data/library.db`。
- 前端：静态 HTML/CSS/JavaScript，位于 `frontend/static/`。
- 数据来源：优先读取 `backend/data/book_collection_filled_1500.docx`，若不存在则生成演示数据。
- 启动方式：运行 `python backend/server.py` 或使用 README 中的 Codex bundled Python 命令。

当前代码没有使用 FastAPI、React、Vue、TypeScript、JWT 或前端构建流程。登录状态由后端内存 `TOKENS` 保存，前端通过 `Authorization: Bearer <token>` 调用 API。

## 2. 已实现功能

- 用户注册、登录和当前用户查询。
- 登录用户修改密码。
- 图书搜索，支持按书名、作者、分类和简介匹配。
- 搜索历史记录。
- 收藏和取消收藏图书。
- 个人中心展示用户名、注册时间、最近登录时间、搜索历史和收藏图书。
- 基于搜索历史和收藏记录的推荐系统。
- 取书任务篮，可从收藏或搜索结果加入图书。
- 30 * 30 图书馆地图可视化。
- 点击绿色阅读区座位作为最终终点。
- 取书路径生成、步骤列表、路径播放、暂停、重置和放大地图弹窗。
- Greedy、Planning、CSP 三种多目标访问顺序求解方式。
- BFS、Uniform Cost Search、A* Search 三种底层路径搜索策略。
- 算法指标展示，包括总代价、扩展节点数、运行时间、求解扩展节点等。

## 3. 数据与数据库

首次启动时，后端会创建或更新 SQLite 表：

- `users`：用户账号、密码哈希、创建时间、最近登录时间。
- `shelves`：书架编号、行列坐标、样式、容量和分类区域。
- `books`：图书编号、原始序号、书名、作者、页数、简介、分类、书架、书架槽位和状态。
- `search_history`：用户搜索关键词和搜索时间。
- `favorites`：用户收藏图书及收藏时间。

图书导入逻辑：

- 若 `book_collection_filled_1500.docx` 存在，后端解析 Word 表格。
- 解析字段包括 `序号`、`书名`、`作者`、`页数（可选）`、`简介（可选）`、`标签`。
- 若 Word 文件不存在，则生成 150 本演示图书。
- 如果数据库已存在图书，启动时不会重复导入，而是根据当前书架布局刷新图书位置。

书架分配逻辑：

- 当前代码通过 `SHELF_GROUPS` 生成书架，而不是从数据库或文档手工配置。
- 当前实际书架数为 248。
- 图书按序循环映射到 `S001` 到 `S248`。
- `shelf_slot` 按图书序号除以书架数计算，不再假设每个书架固定只放 5 本。

## 4. 地图模型

当前地图大小为 `30 * 30`，入口固定为 `(0, 0)`。

地图格子含义：

- `0`：普通通道，可通行，移动代价为 1。
- `1`：书架，不可穿过。
- `2`：入口。
- `4`：拥堵区，可通行，进入该格代价为 2。
- `5`：阅读区座位，可作为终点，但不能作为中途穿越区域。

当前没有固定出口。用户必须在绿色阅读区格子中点击选择最终座位，路径形式为：

```text
入口 -> 若干目标书架相邻取书点 -> 用户选择的阅读区座位
```

阅读区由代码中的 `READING_AREAS` 定义，默认座位为 `(10, 10)`。前端在生成路径前要求用户选择座位。

## 5. 路径规划算法

系统采用两层路径规划。

底层路径搜索策略：

- BFS：按步数扩展，不考虑拥堵区权重的优先级，但返回路径总代价时仍按格子代价统计。
- Uniform Cost Search：使用优先队列，按累计移动代价寻找低代价路径。
- A* Search：在 UCS 基础上加入曼哈顿距离启发式。

移动规则：

- 只能上下左右移动。
- 不能穿过书架。
- 阅读区座位只能作为目标进入，不能作为中途路径穿越。
- 拥堵区可通行，但进入代价为 2。

上层多目标访问顺序策略：

- Greedy：每次从当前位置选择距离最近的下一个取书点。
- Planning：把状态建模为 `(当前位置, 已访问集合)`，使用状态空间搜索确定访问顺序。
- CSP：使用回溯和分支限界搜索访问顺序，约束为每本书恰好访问一次，目标为总代价最小。

Planning 和 CSP 当前最多支持 10 本书；超过 10 本会返回错误提示，建议使用 Greedy。

## 6. 推荐系统

推荐逻辑位于 `recommendations()`。

当前推荐流程：

- 未登录用户：返回默认图书。
- 已登录用户：读取最近搜索历史和收藏图书。
- 使用图书标题、作者、分类、简介生成文本。
- 对图书文本进行分词，构建 TF-IDF 向量。
- 根据搜索关键词和收藏图书构建用户兴趣向量。
- 使用 cosine similarity 对未收藏图书排序。
- 如果相似度不足，则回退到基于收藏分类和搜索关键词的规则推荐。
- 如果仍无结果，则返回默认馆藏推荐。

## 7. 实际 API 清单

认证与用户：

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `POST /api/users/me/password`

图书与推荐：

- `GET /api/books/search?keyword=...&record=1`
- `GET /api/books/recommendations?limit=10`
- `POST /api/books/{id}/favorite`
- `DELETE /api/books/{id}/favorite`

个人与收藏：

- `GET /api/users/me/search-history`
- `GET /api/users/me/favorites`
- `GET /api/favorites`

地图与路径：

- `GET /api/library-map`
- `POST /api/pickup/plan`
- `POST /api/pickup/solve`

统计：

- `GET /api/stats`

当前未实现但旧规划中出现过的接口：

- `POST /api/auth/logout`
- `GET /api/books/{bookId}`
- `POST /api/search-history`
- `GET /api/users/me`
- `DELETE /api/users/me/search-history`

个人信息当前通过 `GET /api/auth/me` 获取。搜索历史由 `GET /api/books/search` 在 `record=1` 时自动记录。

## 8. 主要请求示例

路径求解：

```json
{
  "bookIds": [1, 2, 3],
  "algorithm": "astar",
  "method": "greedy",
  "end": [10, 10]
}
```

字段说明：

- `bookIds`：要取的图书数据库 ID。
- `algorithm`：可选 `astar`、`bfs`、`ucs`。
- `method`：可选 `greedy`、`planning`、`csp`。
- `end`：用户点击选择的阅读区座位坐标。

返回结果包含：

- `algorithm`：底层搜索策略。
- `method`：上层求解方式。
- `distance`：总代价。
- `expanded`：扩展节点数。
- `runtimeMs`：运行时间。
- `path`：完整路径坐标。
- `segments`：分段路径和文字步骤。
- `visitOrder`：图书访问顺序。
- `end`：最终座位。

## 9. 前端页面结构

当前前端是单页静态应用，由 `app.js` 控制页面切换。

页面：

- 登录/注册页：演示账号为 `demo / demo123`。
- 搜索页：搜索图书、展示结果、收藏图书、查看推荐。
- 取书页：三栏布局，左侧任务和步骤，中间地图，右侧算法配置和指标。
- 个人页：用户信息、修改密码、搜索历史、收藏图书。

取书页交互：

- 任务篮可从收藏或搜索结果加入图书。
- 绿色阅读区格子可点击选为终点。
- 生成路径后可播放、暂停、重置。
- 点击步骤可只查看该分段路径。
- 地图可打开大图弹窗。

## 10. 项目结构

```text
backend/
  server.py
  data/
    book_collection_filled_1500.docx
    library.db
frontend/
  static/
    index.html
    styles.css
    app.js
docs/
  library_borrowing_system_plan.md
README.md
start_server.bat
```

## 11. 与旧规划的差异

以下内容曾在早期规划中出现，但当前代码已经不同：

- 地图不是 `24 * 24`，而是 `30 * 30`。
- 书架不是 300 个，而是 248 个。
- 当前没有固定出口，终点由用户选择阅读区座位。
- 当前没有独立的地图表 `library_map`。
- 当前后端不是 FastAPI，前端不是 React/Vue。
- 当前认证不是 JWT，而是运行期内存 token。
- 当前没有管理员角色。
- 当前没有单本图书详情 API。
- 当前没有登出 API；前端如需登出，可以清除本地 token，但当前界面未提供独立登出按钮。

后续若继续开发，应优先以这些实际实现为基础，而不是恢复旧规划中的 24 * 24 或 300 书架方案。

## 12. 课程展示建议

展示时建议突出以下 AI 相关内容：

- 把图书馆抽象为带权网格图。
- 书架和阅读区如何影响可通行性。
- 拥堵区如何让“最短步数”和“最低总代价”产生差异。
- BFS、UCS、A* 在扩展节点数、运行时间和总代价上的对比。
- Greedy、Planning、CSP 在多目标访问顺序上的差异。
- TF-IDF + cosine similarity 推荐系统作为扩展功能。

推荐演示流程：

1. 登录 `demo / demo123`。
2. 搜索并收藏几本书，观察推荐变化。
3. 进入取书页，从收藏或搜索加入多本书。
4. 点击绿色阅读区选择终点座位。
5. 分别切换 Greedy、Planning、CSP 和 BFS、UCS、A*。
6. 比较路线、总代价、扩展节点和运行时间。
