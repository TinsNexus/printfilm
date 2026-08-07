# PRINTFILM 部署（Docker 只跑库与缓存）

## 分工

| 组件 | 运行方式 |
|------|----------|
| PostgreSQL | Docker |
| Redis | Docker |
| FastAPI / Celery worker | 宿主机 Python 进程 |
| 前端 | 宿主机 `npm run dev` 或 `npm run build` + 静态托管 |

## 1. 启动中间件（独立目录，不复用其它项目的库）

```bash
cp deploy/.env.prod.example deploy/.env.prod   # 改密码；默认端口 15432 / 16379
docker compose -f deploy/docker-compose.yml --env-file deploy/.env.prod up -d
docker compose -f deploy/docker-compose.yml ps
```

容器名：`ai-movie-pg`、`ai-movie-redis`。与 kepu（5432/6379）隔离。

## 2. 配置应用

将 `deploy/.env.prod` 中的 `DATABASE_URL` / `REDIS_URL` / `ARK_*` 等写入 `backend/.env`（密码与 compose 一致）。

正式环境示例：

```env
DATABASE_URL=postgresql+asyncpg://printfilm:<密码>@127.0.0.1:5432/printfilm
DATABASE_URL_SYNC=postgresql+psycopg2://printfilm:<密码>@127.0.0.1:5432/printfilm
REDIS_URL=redis://127.0.0.1:6379/0
USE_CELERY=true
```

需本机已安装：Python 3.12、FFmpeg（PATH）、Node.js。

## 3. 启动 API + Worker

```bash
cd backend
python -m venv .venv
# Windows: .\.venv\Scripts\activate
# Linux:  source .venv/bin/activate
pip install -r requirements.txt

uvicorn app.main:app --host 0.0.0.0 --port 8000

# 另开终端 — 固定并发
celery -A app.workers.celery_app.celery_app worker -Q pipeline,oss -l info --concurrency=2

# 或 Windows 动态加减进程
python -m app.workers.autoscale
```

## 4. 前端

```bash
cd frontend
npm install
npm run dev          # 开发
# npm run build && npx serve dist   # 简单静态托管
```

## 运维

```bash
# 看中间件日志
docker compose -f deploy/docker-compose.yml --env-file deploy/.env.prod logs -f

# 停中间件（不删数据）
docker compose -f deploy/docker-compose.yml --env-file deploy/.env.prod down

# 停并删卷（清库/清 Redis）
docker compose -f deploy/docker-compose.yml --env-file deploy/.env.prod down -v
```

Worker 伸缩：改 Celery `--concurrency`，或跑 `python -m app.workers.autoscale`（按队列积压加减本机进程）。

## OSS（成片 / 分镜 / 前端）

在 `backend/.env` 开启：

```env
OSS_ENABLED=true
OSS_ENDPOINT=oss-cn-beijing.aliyuncs.com
OSS_BUCKET=your-bucket
OSS_FOLDER=kepu
OSS_ACCESS_KEY_ID=...
OSS_ACCESS_KEY_SECRET=...
```

- 分镜图/视频/配音/成片：本地落盘供 FFmpeg，上传后 DB 存 OSS 公网 URL（前端预览走 OSS）
- 对象前缀：`kepu/generated/p{id}/...`
- 前端构建产物上传：

```bash
cd frontend && npm run build
cd ../backend && .venv/bin/python ../deploy/scripts/upload_oss_web.py
# → https://your-bucket.oss-cn-beijing.aliyuncs.com/kepu/index.html
```
