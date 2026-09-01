# PRINTFILM

科普视频平台：模板驱动的 AI 短视频创作。同一条生成流水线，多套视觉风格模板。

## 能力（本期）

- 6 套内置模板（剪纸 / 绘本 / 粉笔 / 拼贴 / 像素 / 水墨）
- 注册登录 + 额度
- 主题/文案 → 分镜脚本 → 分镜图 → 视频片段 → 配音 → 合成
- 分镜编辑、单张重绘、单镜头重生视频
- 作品发布与简单浏览

## 漫剧模块（Drama）

短剧/漫剧创作工作流：大纲 → 资产 → 分集分镜 → 画布。

- 前端路由：`/drama`、`/drama/dramas`、`/drama/assets`、`/drama/projects/:projectId`、`/drama/projects/:projectId/episodes/:episodeId`、`/drama/projects/:projectId/canvas`
- 后端 API：`/api/drama/*`（项目、剧本、资产、分集、生成、画布）
- 管理后台：`/drama-projects`（列表分页，含用户邮箱）

## 本地启动

### 依赖

- Python 3.12 + FFmpeg（PATH）
- Node.js（前端）
- Docker 仅用于 **Postgres / Redis**（见 [deploy/README.md](deploy/README.md)）

```bash
# 中间件（Postgres + Redis）
cp deploy/.env.prod.example deploy/.env.prod
docker compose -f deploy/docker-compose.yml --env-file deploy/.env.prod up -d

cd backend
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env   # 填 DATABASE_URL / ARK_API_KEY；正式库见 deploy/.env.prod.example

uvicorn app.main:app --reload --port 8000
```

### 前端

```bash
cd frontend
npm install
npm run dev
```

### 管理后台

独立前端（shadcn/ui），开发端口 **5174**。管理员复用同一套登录，需 `User.role=admin`。

```bash
# backend/.env 增加（将已有邮箱提权，重启后端生效）
# ADMIN_BOOTSTRAP_EMAILS=you@example.com

cd admin
npm install
npm run dev
```

浏览器打开 `http://localhost:5174`，用管理员账号登录。

### 真模型配置

`backend/.env`：

| 变量 | 说明 |
|---|---|
| `ARK_MOCK=false` | 关闭 mock |
| `ARK_API_KEY` | 方舟 API Key |
| `MODEL_LLM` / `MODEL_IMAGE` / `MODEL_VIDEO` / `MODEL_AUDIO` | 控制台推理接入点 ID |
| `USE_CELERY` | 已废弃；当前任务平台默认由应用内 scheduler / executor 驱动 |

素材：`backend/static/generated/p{id}/`；成片由 FFmpeg 合成。

## 架构摘要

- FastAPI + PostgreSQL（Docker）
- Redis（可选）：部分进度/基础设施可复用，已不再作为任务平台前提
- 内置任务平台：`scheduler + executor + poller`（随 FastAPI 进程启动）
- 前端：React + TS + Vite（用户端）
- 管理后台：`admin/` React + shadcn/ui（端口 5174）

## 目录

```
backend/app/          API、模型、流水线、方舟适配
backend/static/       模板封面与 mock 素材
frontend/src/         首页模板墙 + 创作工作台
admin/src/            运营管理后台（用户/订单/项目/作品/模板）
deploy/               仅 Postgres + Redis 的 compose
docs/                 规范、发布、计费与产品文档
```

工程约定见 **[docs/STANDARDS.md](docs/STANDARDS.md)**；线上发布见 [docs/DEPLOY.md](docs/DEPLOY.md)。
