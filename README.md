# 图书馆智能借阅系统

这是一个面向 `DI22001 - Algorithms and Artificial Intelligence AI Project` 的图书馆借阅网站原型。系统包含用户登录、图书搜索、个性化推荐、收藏管理、个人中心，以及以算法展示为核心的馆内多目标取书路径规划。

本文档以当前代码为准。当前实现是 Python 标准库后端 + SQLite + 静态前端，不依赖 FastAPI、React、Vue 或额外前端构建工具。

## 功能

- 注册和登录。
- 登录后可修改密码。
- 搜索 Goodreads 10k 数据集中的 10000 本图书，并支持 genre、出版社、年份、评分等高级筛选。
- 根据搜索历史、收藏记录、图书元数据、Goodreads 交互数据和热门度生成可解释混合推荐。
- 收藏图书并在个人中心查看。
- 在取书界面构建“本次取书”任务篮，可从“我的收藏”或搜索结果中直接加入图书。
- 基于 `30 * 30` 图书馆地图规划路线：入口出发，经过目标书架，最终到用户选择的阅读区座位。
- 地图包含书架、阅读区、拥堵区和入口；书架与阅读区不可穿过，拥堵区可通行但每步代价为 2。
- 支持 BFS、Uniform Cost Search、A* 曼哈顿和 A* 欧几里得作为底层两点路径搜索策略。
- 支持贪心最近邻、贪心 + 2-opt、状态空间 A* 搜索和分支限界搜索作为多本书访问顺序求解方式。
- 前端提供地图可视化、路径播放、步骤高亮、放大地图弹窗和算法指标展示。

## 数据

项目提交的是原始数据集 CSV，不提交本地 SQLite 数据库：

```text
backend/data/dataset/books_10k.csv
backend/data/dataset/book_shelves_10k.csv
backend/data/dataset/interactions_10k.csv
backend/data/dataset/book_id_map_10k.csv
```

首次启动后端时，`backend/server.py` 会自动创建本机数据库：

```text
backend/data/library.db
```

`library.db` 是生成产物，已被 `.gitignore` 忽略。它不需要、也不应该提交到远程仓库。数据库不存在时，`init_db()` 会创建表结构，并从上面的 CSV 导入 10000 本书、书架标签、Goodreads 交互记录和 ID 映射；数据库已存在时，启动会保留用户、收藏和历史记录，并做幂等迁移和元数据补齐。

后端使用 `backend/server.py` 所在位置推导项目根目录，因此移动整个项目文件夹后，仍会读取项目内的 `backend/data/dataset/`，不会依赖某台电脑上的个人绝对路径。

当前地图根据代码中的 `SHELF_GROUPS` 生成 `248` 个书架格。10000 本图书会循环映射到这些实际书架上，并保留取书路径规划所需的 `shelf_id` 和 `shelf_slot`。

## 启动

使用 Python 运行：

```bash
python3 backend/server.py
```

第一次启动会生成 `backend/data/library.db`，导入 Goodreads 数据集可能需要等待几秒。启动后访问：

```text
http://127.0.0.1:8000
```

不要直接双击打开 `frontend/static/index.html`，否则浏览器只会打开静态文件，无法调用后端 API。

如果需要重新生成数据库，先停止后端服务，然后删除：

```text
backend/data/library.db
```

再重新运行 `python3 backend/server.py` 即可。

演示账号：

```text
username: demo
password: demo123
```

## API 摘要

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `POST /api/users/me/password`
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

当前代码没有实现 `/api/auth/logout`、`GET /api/books/{id}`、`POST /api/search-history` 或单独的 `GET /api/users/me`；个人信息通过 `GET /api/auth/me` 获取。

`POST /api/pickup/solve` 支持传入：

```json
{
  "bookIds": [1, 2, 3],
  "algorithm": "astar_manhattan",
  "method": "greedy",
  "end": [10, 10]
}
```

其中 `algorithm` 可选 `bfs`、`ucs`、`astar_manhattan`、`astar_euclidean`；`method` 可选 `greedy`、`greedy_2opt`、`state_astar`、`branch_bound`；`end` 是用户在绿色阅读区选择的最终座位坐标。

## 项目结构

```text
backend/
  server.py              # HTTP API、SQLite 初始化、推荐、地图和路径算法
  data/
    dataset/
      books_10k.csv
      book_shelves_10k.csv
      interactions_10k.csv
      book_id_map_10k.csv
    library.db           # 本地自动生成，Git 不跟踪
frontend/
  static/
    index.html
    styles.css
    app.js
docs/
  library_borrowing_system_plan.md
```
