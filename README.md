# 图书馆智能借阅系统

这是一个面向 `DI22001 - Algorithms and Artificial Intelligence AI Project` 的图书馆借阅网站原型。系统包含用户登录、图书搜索、个性化推荐、收藏管理、个人中心，以及以算法展示为核心的馆内多目标取书路径规划。

## 功能

- 注册和登录。
- 搜索 `book_collection_filled_1500.docx` 中的 1500 本图书。
- 根据搜索历史和收藏记录生成推荐，推荐系统使用 TF-IDF 向量化和 cosine similarity。
- 收藏图书并在个人中心查看。
- 在取书界面构建“本次取书”任务篮，可从“我的收藏”或搜索结果中直接加入图书。
- 基于 `30 * 30` 图书馆地图规划路线：入口出发，经过目标书架，最终到用户选择的阅读区座位。
- 地图包含书架、阅读区、拥堵区和入口；书架与阅读区不可穿过，拥堵区可通行但每步代价为 2。
- 支持 BFS、Uniform Cost Search 和 A* Search 作为底层路径搜索策略。
- 支持 Greedy、Planning 和 CSP 作为多本书访问顺序求解方式。
- 前端提供地图可视化、路径播放、步骤高亮、放大地图弹窗和算法指标展示。

## 数据

系统首次启动时会尝试读取：

```text
backend/data/book_collection_filled_1500.docx
```

如果文件存在，会自动导入 1500 本图书。如果文件不存在，会使用一组演示数据，方便系统仍然可以运行。

当前地图根据前端设计图生成 `248` 个书架格。1500 本图书会映射到这些实际书架上，不再强行假设 300 个书架或每个书架固定 5 本书。

## 启动

使用 Python 运行：

```powershell
python backend/server.py
```

如果使用 Codex bundled Python：

```powershell
& 'C:\Users\Lenovo\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' backend/server.py
```

启动后访问：

```text
http://127.0.0.1:8000
```

演示账号：

```text
username: demo
password: demo123
```

## API 摘要

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `GET /api/books/search?keyword=...`
- `GET /api/books/recommendations?limit=10`
- `POST /api/books/{id}/favorite`
- `DELETE /api/books/{id}/favorite`
- `GET /api/users/me/search-history`
- `GET /api/users/me/favorites`
- `GET /api/favorites`
- `GET /api/library-map`
- `POST /api/pickup/plan`
- `POST /api/pickup/solve`
- `GET /api/stats`

`POST /api/pickup/solve` 支持传入：

```json
{
  "bookIds": [1, 2, 3],
  "algorithm": "astar",
  "method": "greedy",
  "end": [10, 10]
}
```

其中 `algorithm` 可选 `astar`、`bfs`、`ucs`；`method` 可选 `greedy`、`planning`、`csp`；`end` 是用户在绿色阅读区选择的最终座位坐标。

## 项目结构

```text
backend/
  server.py              # HTTP API、数据库、推荐、地图和路径算法
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
```
