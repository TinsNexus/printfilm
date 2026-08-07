# PRINTFILM

科普视频平台：模板驱动的 AI 短视频创作。同一条生成流水线，多套视觉风格模板。

## 能力（本期）

- 6 套内置模板（剪纸 / 绘本 / 粉笔 / 拼贴 / 像素 / 水墨）
- 注册登录 + 额度
- 主题/文案 → 分镜脚本 → 分镜图 → 视频片段 → 配音 → 合成
- 分镜编辑、单张重绘、单镜头重生视频
- 作品发布与简单浏览

## 本地启动

### 依赖

- Python 3.12 + FFmpeg（PATH）
- Node.js（前端）
- Docker 仅用于 **Postgres / Redis**（见 [deploy/README.md](deploy/README.md)）

```bash
# 中间件
cp deploy/.env.prod.example deploy/.env.prod
docker compose -f deploy/docker-compose.yml --env-file deploy/.env.prod up -d

# 或开发只用 Redis + SQLite
docker run -d --name printfilm-redis -p 6379:6379 redis:7-alpine

cd backend
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env   # 填 ARK_API_KEY；正式库见 deploy/.env.prod.example

uvicorn app.main:app --reload --port 8000

# 另开终端
celery -A app.workers.celery_app.celery_app worker -Q pipeline -l info --concurrency=2
# 或: python -m app.workers.autoscale
```

### 前端

```bash
cd frontend
npm install
npm run dev
```

### 真模型配置

`backend/.env`：

| 变量 | 说明 |
|---|---|
| `ARK_MOCK=false` | 关闭 mock |
| `ARK_API_KEY` | 方舟 API Key |
| `MODEL_LLM` / `MODEL_IMAGE` / `MODEL_VIDEO` / `MODEL_AUDIO` | 控制台推理接入点 ID |
| `USE_CELERY=true` | 走 Celery；Redis 不通时自动 in-process |

素材：`backend/static/generated/p{id}/`；成片由 FFmpeg 合成。

## 架构摘要

- FastAPI + PostgreSQL（Docker）/ 本地可 SQLite
- Redis（Docker）：Celery broker + 进度
- Celery worker / `autoscale`：宿主机进程
- 前端：React + TS + Vite

## 目录

```
backend/app/          API、模型、流水线、方舟适配
backend/static/       模板封面与 mock 素材
frontend/src/         首页模板墙 + 创作工作台
deploy/               仅 Postgres + Redis 的 compose
```
