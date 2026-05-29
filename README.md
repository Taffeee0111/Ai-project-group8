# 图书馆智能借阅系统

这是一个面向 `DI22001 - Algorithms and Artificial Intelligence AI Project` 的图书馆借阅网站原型。系统包含用户登录、图书搜索、个性化推荐、收藏管理、个人中心，以及以算法展示为核心的馆内多目标取书路径规划。

本文档以当前代码为准。当前实现是 Python 标准库后端 + SQLite + 静态前端，不依赖 FastAPI、React、Vue 或额外前端构建工具。推荐系统部分使用离线训练的经典机器学习模型；模型训练是可选步骤，未训练时网站仍会使用热门高评分图书兜底推荐。

## 功能

- 注册和登录。
- 登录后可修改密码。
- 搜索 Goodreads 10k 数据集中的 10000 本图书，并支持 genre、出版社、年份、评分等高级筛选。
- 使用离线训练的 SVD 协同过滤模型生成个性化推荐；无收藏时使用 TF-IDF 内容冷启动，模型缺失时回退到热门高评分图书。
- 收藏图书并在个人中心查看。
- 在取书界面构建“本次取书”任务篮，可从“我的收藏”或搜索结果中直接加入图书。
- 基于 `30 * 30` 图书馆地图规划路线：入口出发，经过目标书架，最终到用户选择的阅读区座位。
- 地图包含书架、阅读区、拥堵区和入口；书架与阅读区不可穿过，拥堵区可通行但每步代价为 2。
- 支持 BFS、Uniform Cost Search、A* 曼哈顿和 A* 欧几里得作为底层两点路径搜索策略。
- 支持贪心最近邻和贪心 + 2-opt 作为多本书访问顺序求解方式，并可开启 CSP 约束传播来合并同取书点、批处理同点任务、减少路径查询和候选转移。
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

`library.db` 是生成产物，已被 `.gitignore` 忽略。它不需要、也不应该提交到远程仓库。数据库不存在时，`init_db()` 会创建表结构，并从 `books_10k.csv` 导入 10000 本书；数据库已存在时，启动会保留用户、收藏和历史记录，并做幂等迁移和元数据补齐。`interactions_10k.csv` 不再导入 SQLite，而是用于离线训练推荐模型。

后端使用 `backend/server.py` 所在位置推导项目根目录，因此移动整个项目文件夹后，仍会读取项目内的 `backend/data/dataset/`，不会依赖某台电脑上的个人绝对路径。

当前地图根据代码中的 `SHELF_GROUPS` 生成 `248` 个书架格。10000 本图书会循环映射到这些实际书架上，并保留取书路径规划所需的 `shelf_id` 和 `shelf_slot`。

## 机器学习推荐

推荐系统已经从规则加权推荐改为“离线训练 + 在线推理”：

- 离线训练脚本：`backend/ml/train_recommender.py`
- 训练数据：`books_10k.csv` 和 `interactions_10k.csv`
- 协同过滤模型：`scikit-learn` 的 `TruncatedSVD`
- 内容冷启动模型：`TfidfVectorizer`
- 模型产物：`backend/data/models/recommender.joblib`

安装训练依赖：

```bash
python3 -m pip install -r requirements.txt
```

训练模型：

```bash
python3 backend/ml/train_recommender.py
```

训练成功后会输出模型路径、图书数、用户数、正向交互数、embedding 维度和基础相似度指标。`recommender.joblib` 是本地生成产物，已被 `.gitignore` 忽略，不需要提交。没有安装机器学习依赖或没有训练模型时，搜索、登录、收藏、取书路径规划等核心功能仍可使用；受影响的只是完整的 SVD / TF-IDF 机器学习推荐。

在线推荐流程：

- 用户已登录且有收藏：根据收藏图书的 SVD embedding 生成用户向量，召回相似图书，方法名为 `svd_collaborative_filtering`。
- 用户无收藏但有搜索历史：用最近搜索词在 TF-IDF 内容空间召回图书，方法名为 `content_cold_start`。
- 模型文件不存在、加载失败或用户信号不足：返回热门高评分图书，方法名为 `popularity_fallback`。

## 启动

推荐新用户先运行初始化脚本，它会创建本地 `.venv`、安装 `requirements.txt`，并询问是否立即训练推荐模型。训练可以跳过；跳过后系统仍可启动，推荐区会使用热门高评分图书作为兜底。

macOS / Linux：

```bash
./setup.command
./start_server.command
```

Windows：

```bat
setup.bat
start_server.bat
```

Windows 初始化脚本会优先使用 `python`，找不到时会尝试 `py -3`。

启动后访问：

```text
http://127.0.0.1:8000
```

首次启动会生成 `backend/data/library.db`，并从 Goodreads CSV 导入图书数据。终端会显示数据库检查、导入和准备完成的提示；导入可能需要等待一会儿。

如果 `8000` 端口被占用，后端会给出提示。可以关闭占用该端口的程序，或用其他端口启动，例如：

```bash
PORT=8001 ./start_server.command
```

也可以不使用脚本，直接用 Python 运行：

```bash
python3 backend/server.py
```

不要直接双击打开 `frontend/static/index.html`，否则浏览器只会打开静态文件，无法调用后端 API。

如果需要重新生成数据库，先停止后端服务，然后删除：

```text
backend/data/library.db
```

再重新运行 `python3 backend/server.py` 即可。

如果需要重新生成推荐模型，删除或覆盖：

```text
backend/data/models/recommender.joblib
```

然后重新运行 `python3 backend/ml/train_recommender.py`，或重新运行 setup 脚本并选择训练模型。后端服务不会在启动时自动训练模型；模型缺失时网站仍可运行，并使用热门推荐兜底。前端推荐区会明确显示“未训练也可使用，当前展示热门高评分推荐”。

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
- `GET /api/books/recommendations?limit=10&analysis=1`
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
  "end": [10, 10],
  "constraintsEnabled": false
}
```

其中 `algorithm` 可选 `bfs`、`ucs`、`astar_manhattan`、`astar_euclidean`；`method` 可选 `greedy`、`greedy_2opt`；`end` 是用户在绿色阅读区选择的最终座位坐标；`constraintsEnabled` 为可选布尔值，开启后会先执行 CSP 约束削减再规划路线。

## 项目结构

```text
backend/
  ml/
    train_recommender.py   # 离线训练 SVD + TF-IDF 推荐模型
  server.py              # HTTP API、SQLite 初始化、推荐、地图和路径算法
  data/
    dataset/
      books_10k.csv
      book_shelves_10k.csv
      interactions_10k.csv
      book_id_map_10k.csv
    library.db           # 本地自动生成，Git 不跟踪
    models/
      recommender.joblib  # 本地训练生成，Git 不跟踪
frontend/
  static/
    index.html
    styles.css
    app.js
docs/
  library_borrowing_system_plan.md
requirements.txt
setup.command          # macOS/Linux 初始化：创建 .venv、安装依赖、可选训练模型
setup.bat              # Windows 初始化：兼容 python / py -3
start_server.command   # macOS/Linux 启动本地服务
start_server.bat       # Windows 启动本地服务
```
