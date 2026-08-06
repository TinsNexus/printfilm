# PRINTFILM

科普视频平台：模板驱动的 AI 短视频创作。同一条生成流水线，多套视觉风格模板。

## 能力（本期）

- 6 套内置模板（剪纸 / 绘本 / 粉笔 / 拼贴 / 像素 / 水墨）
- 注册登录 + 额度
- 主题/文案 → 分镜脚本 → 分镜图 → 视频片段 → 配音 → 合成（当前默认 **Mock 方舟**）
- 分镜编辑、单张重绘、单镜头重生视频
- 作品发布与简单浏览

## 本地启动

### 依赖

- Python 3.12 + FFmpeg（已加入 PATH）
- Redis（Celery broker；无 Redis 时自动回退进程内异步）

```bash
# Redis（推荐 Docker）
docker run -d --name framecut-redis -p 6379:6379 redis:7-alpine

cd backend
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env   # 填入 ARK_API_KEY，并把 MODEL_* 换成方舟接入点 ID

# API
uvicorn app.main:app --reload --port 8000

# Worker（另开终端；USE_CELERY=true 且 Redis 可用时需要）
celery -A app.workers.celery_app.celery_app worker -Q pipeline -l info --concurrency=2
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
| `MODEL_LLM` / `MODEL_IMAGE` / `MODEL_VIDEO` / `MODEL_AUDIO` | **控制台推理接入点 ID** |
| `USE_CELERY=true` | 走 Celery；Redis 不通时自动 in-process |

素材落盘：`backend/static/generated/p{id}/`；成片 `final.mp4` 由 FFmpeg 拼接字幕烧录。

TTS 若接入点未开通，会降级为静音轨，画面与字幕仍可合成。

## 架构摘要

- FastAPI + SQLite（可换 MySQL）
- 模板表驱动风格：`style_prefix` / Seedream / Seedance / Audio / 字幕配置
- 异步流水线：进程内 asyncio（可平滑换成 Celery + Redis）
- 前端：React + TS + Vite

## 目录

```
backend/app/          API、模型、流水线、方舟适配
backend/static/       模板封面与 mock 素材
frontend/src/         首页模板墙 + 创作工作台
```
