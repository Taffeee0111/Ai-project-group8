# 图书馆智能借阅系统

这是一个面向 AI Project 的图书馆借阅网站原型。系统包含用户登录、图书搜索、个性化推荐、收藏管理、个人中心，以及基于 `24 * 24` 棋盘地图的取书路径规划。

## 功能

- 注册和登录。
- 搜索 `book_collection_filled_1500.docx` 中的 1500 本图书。
- 根据搜索历史和收藏记录生成推荐。
- 收藏图书并在个人中心查看。
- 从收藏中选择多本书，使用 BFS、Uniform Cost Search 或 A* Search 规划取书路径。
- 地图包含 300 个书架，每个书架存放 5 本书。

## 数据

系统首次启动时会尝试读取：

```text
C:\Users\Lenovo\xwechat_files\wxid_7v70kqj8qvgp22_7bdd\msg\file\2026-05\book_collection_filled_1500.docx
```

如果文件存在，会自动导入 1500 本图书。如果文件不存在，会使用一组演示数据，方便系统仍然可以运行。

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
- `GET /api/library-map`
- `POST /api/pickup/plan`
- `GET /api/stats`

## 项目结构

```text
backend/
  server.py              # HTTP API、数据库、推荐、路径算法
  data/
    library.db           # 首次运行后自动生成
frontend/
  static/
    index.html
    styles.css
    app.js
docs/
  library_borrowing_system_plan.md
```

