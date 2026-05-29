# 图书馆智能借阅系统实现文档

本文档根据当前代码整理，若文档与代码存在差异，以代码为准。当前核心代码位于 `backend/server.py`、`backend/ml/train_recommender.py`、`frontend/static/index.html`、`frontend/static/app.js` 和 `frontend/static/styles.css`。

## 1. 当前实现概览

本项目是一个用于课程展示的图书馆智能借阅网站原型，主线是“多目标取书路径规划与搜索策略比较”，支撑功能包括登录注册、图书搜索、收藏、个人中心和个性化推荐。

当前技术结构：

- 后端：Python 标准库 `http.server`，入口为 `backend/server.py`。
- 数据库：SQLite，数据库文件为 `backend/data/library.db`。
- 前端：静态 HTML/CSS/JavaScript，位于 `frontend/static/`。
- 数据来源：项目内的 Goodreads 10k CSV 数据集，位于 `backend/data/dataset/`。
- 机器学习：`scikit-learn` 的 `TruncatedSVD` 协同过滤模型 + `TfidfVectorizer` 内容冷启动模型。
- 启动方式：新用户优先运行 `setup.command` / `setup.bat` 初始化本地 `.venv`，再运行 `start_server.command` / `start_server.bat` 启动服务；也可以直接运行 `python3 backend/server.py`。
- 推荐模型通过 `backend/ml/train_recommender.py` 离线训练，setup 脚本会询问是否训练。训练可跳过；模型缺失时服务仍能启动，并使用热门推荐兜底。

当前代码没有使用 FastAPI、React、Vue、TypeScript、JWT 或前端构建流程。登录状态由后端内存 `TOKENS` 保存，前端通过 `Authorization: Bearer <token>` 调用 API。机器学习依赖只在训练和模型加载时使用；模型缺失时服务仍能启动，并使用热门推荐兜底，前端会显示“未训练也可使用，当前展示热门高评分推荐”。

## 2. 已实现功能

- 用户注册、登录和当前用户查询。
- 登录用户修改密码。
- 图书搜索，支持按书名、作者、分类、简介、ISBN、出版社、年份和评分等字段匹配或筛选。
- 搜索历史记录。
- 收藏和取消收藏图书。
- 个人中心展示用户名、注册时间、最近登录时间、搜索历史和收藏图书。
- 基于离线训练 SVD 协同过滤模型的推荐系统，并提供 TF-IDF 内容冷启动和热门推荐兜底。
- 取书任务篮，可从收藏或搜索结果加入图书。
- 30 * 30 图书馆地图可视化。
- 点击绿色阅读区座位作为最终终点。
- 取书路径生成、步骤列表、路径播放、暂停、重置和放大地图弹窗。
- 贪心最近邻、贪心 + 2-opt 两种多目标访问顺序求解方式。
- 可选 CSP 约束传播开关，用于合并同取书点、削减路径查询和过滤不可行候选。
- BFS、Uniform Cost Search、A* 曼哈顿、A* 欧几里得四种底层路径搜索策略。
- 算法指标展示，包括总代价、扩展节点数、运行时间、求解扩展节点等。

## 3. 数据与数据库

首次启动时，后端会创建或更新 SQLite 表：

- `users`：用户账号、密码哈希、创建时间、最近登录时间。
- `shelves`：书架编号、行列坐标、样式、容量和分类区域。
- `books`：图书编号、原始序号、书名、作者、页数、简介、分类、书架、书架槽位和状态。
- `search_history`：用户搜索关键词和搜索时间。
- `favorites`：用户收藏图书及收藏时间。

图书导入逻辑：

- 后端优先读取 `backend/data/dataset/books_10k.csv`，导入 10000 本 Goodreads 图书。
- 首次导入前，终端会打印数据库初始化和导入提示，避免新用户误以为启动卡住。
- 导入字段包括书名、原始书名、作者、出版社、出版年份、ISBN、页数、评分、评分人数、genres、top shelves、简介和图片 URL 等。
- 如果数据库已存在图书，启动时不会重复导入，而是根据当前书架布局刷新图书位置，并补齐新增元数据字段。
- 历史版本使用过的 `dataset_interactions`、`dataset_book_shelves`、`dataset_book_id_map` SQLite 辅助表会在启动迁移时删除；推荐训练改为直接读取 CSV。

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
- A* 曼哈顿：在 UCS 基础上加入曼哈顿距离启发式，适合四方向网格移动。
- A* 欧几里得：在 UCS 基础上加入欧几里得距离启发式，用于对比不同启发式函数对扩展节点的影响。

移动规则：

- 只能上下左右移动。
- 不能穿过书架。
- 阅读区座位只能作为目标进入，不能作为中途路径穿越。
- 拥堵区可通行，但进入代价为 2。

上层多目标访问顺序策略：

- 贪心最近邻：每次从当前位置选择距离最近的下一个取书点，速度快但不保证全局最优。
- 贪心 + 2-opt：先生成贪心顺序，再通过局部反转片段改进总代价。
- CSP 约束传播：作为可选开关先合并同取书点、批处理同点任务，并用候选边上下文与路径缓存减少求解成本。

## 6. 推荐系统

推荐系统分为离线训练和在线推理两部分。

离线训练入口为 `backend/ml/train_recommender.py`：

```bash
python3 -m pip install -r requirements.txt
python3 backend/ml/train_recommender.py
```

训练数据：

- `books_10k.csv`：图书元数据和文本特征。
- `interactions_10k.csv`：匿名 Goodreads 用户与图书的交互记录。

训练产物：

```text
backend/data/models/recommender.joblib
```

该文件包含：

- `book_ids` 和 `book_id_to_index`：模型内部图书索引。
- `item_factors`：通过 `TruncatedSVD` 从图书-用户交互矩阵学习得到的图书 embedding。
- `tfidf_vectorizer` 和 `content_matrix`：用于内容冷启动的 TF-IDF 模型和图书内容矩阵。
- `metadata`：算法名、图书数、用户数、正向交互数、embedding 维度等训练信息。

在线推荐逻辑位于 `recommendations()`：

- 未登录用户：返回热门高评分图书，并提示登录后可生成机器学习推荐。
- 已登录且有收藏：加载 `recommender.joblib`，将收藏图书 embedding 平均为用户向量，按向量相似度召回未收藏图书，`recommendation_method` 为 `svd_collaborative_filtering`。
- 已登录但无收藏、有搜索历史：使用最近搜索词通过 TF-IDF 内容模型召回图书，`recommendation_method` 为 `content_cold_start`。
- 模型文件不存在、模型加载失败或用户信号不足：返回热门高评分图书，`recommendation_method` 为 `popularity_fallback`。

推荐接口返回 `ml_score`、`reason`、`recommendation_method` 和 `modelStatus`。前端只展示推荐结果、模型状态和兜底说明，不再展示旧版“内容/协同/热度/新颖”的规则拆分。模型未训练时不会阻塞网站使用；只有完整机器学习推荐受影响。

## 7. 启动与新用户体验

推荐启动流程：

```bash
./setup.command
./start_server.command
```

Windows 对应使用：

```bat
setup.bat
start_server.bat
```

setup 脚本会：

- 创建本地 `.venv`。
- 安装 `requirements.txt`，并提示首次安装可能需要几分钟。
- 询问是否训练推荐模型。跳过也能使用系统，只是推荐先使用热门高评分图书。
- Windows 下优先使用 `python`，找不到时尝试 `py -3`。

启动脚本会优先使用本地 `.venv`。如果未初始化，会提示先运行 setup。

服务启动时会打印数据库准备进度。若 `127.0.0.1:8000` 被占用，会提示关闭占用程序，或用类似下面的命令换端口：

```bash
PORT=8001 ./start_server.command
```

## 8. 实际 API 清单

认证与用户：

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `POST /api/users/me/password`

图书与推荐：

- `GET /api/books/search?keyword=...&record=1`
- `GET /api/books/recommendations?limit=10`
- `GET /api/books/recommendations?limit=10&analysis=1`
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

## 9. 主要请求示例

路径求解：

```json
{
  "bookIds": [1, 2, 3],
  "algorithm": "astar_manhattan",
  "method": "greedy",
  "end": [10, 10],
  "constraintsEnabled": false
}
```

字段说明：

- `bookIds`：要取的图书数据库 ID。
- `algorithm`：可选 `bfs`、`ucs`、`astar_manhattan`、`astar_euclidean`。
- `method`：可选 `greedy`、`greedy_2opt`。
- `end`：用户点击选择的阅读区座位坐标。
- `constraintsEnabled`：可选布尔值，开启后先执行 CSP 约束削减再规划路线。

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

推荐分析接口：

```text
GET /api/books/recommendations?limit=10&analysis=1
```

返回结果包含：

- `summary`：当前推荐系统说明。
- `modelStatus`：模型是否可用、算法名、图书数、用户数、正向交互数、embedding 维度等。
- `profileKeywords`：根据搜索历史和收藏生成的用户画像关键词。
- `preferredGenres`：偏好分类或关键词。
- `books`：推荐图书列表。

## 10. 前端页面结构

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

## 11. 项目结构

```text
backend/
  ml/
    train_recommender.py
  server.py
  data/
    dataset/
      books_10k.csv
      book_shelves_10k.csv
      interactions_10k.csv
      book_id_map_10k.csv
    library.db
    models/
      recommender.joblib
frontend/
  static/
    index.html
    styles.css
    app.js
docs/
  library_borrowing_system_plan.md
README.md
requirements.txt
setup.command
setup.bat
start_server.command
start_server.bat
```

## 12. 与旧规划的差异

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
- 推荐系统不再在 SQLite 中导入原始交互表，也不再使用旧版手写混合权重 `content/collaborative/popularity/novelty`。

后续若继续开发，应优先以这些实际实现为基础，而不是恢复旧规划中的 24 * 24 或 300 书架方案。

## 13. 课程展示建议

展示时建议突出以下 AI 相关内容：

- 把图书馆抽象为带权网格图。
- 书架和阅读区如何影响可通行性。
- 拥堵区如何让“最短步数”和“最低总代价”产生差异。
- BFS、UCS、A* 在扩展节点数、运行时间和总代价上的对比。
- 贪心最近邻、贪心 + 2-opt 在多目标访问顺序上的差异。
- CSP 约束传播开关如何通过合并同取书点、批处理组、路径缓存和候选边剪枝提升性能。
- SVD 协同过滤推荐如何从 Goodreads 交互数据学习图书 embedding。
- TF-IDF 内容模型如何在用户无收藏时做冷启动推荐。
- 模型缺失时如何通过热门高评分图书兜底，保证系统可用。

推荐演示流程：

1. 登录 `demo / demo123`。
2. 先运行 `python3 backend/ml/train_recommender.py` 确保模型可用。
3. 搜索并收藏几本书，观察推荐变化。
4. 进入取书页，从收藏或搜索加入多本书。
5. 点击绿色阅读区选择终点座位。
6. 分别切换三种整体取书算法、CSP 约束传播开关和 BFS、UCS、A* 曼哈顿、A* 欧几里得。
7. 比较路线、总代价、扩展节点和运行时间。
