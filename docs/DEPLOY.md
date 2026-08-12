# 线上发布流程（kepu.printfilm.com）

生产站点：**不是**把前端 dist 丢到 OSS 当「发布」。OSS 仅用于成片/分镜等媒体；站点由服务器 nginx + systemd 托管。

| 站点 | 地址 | 静态根目录 |
|------|------|------------|
| 用户前台 | https://kepu.printfilm.com/ | `/opt/ai_movie/frontend/dist` |
| 管理后台 | https://admin.kepu.printfilm.com/ | `/opt/ai_movie/admin/dist` |
| API | 同源 `/api` → `127.0.0.1:8000` | uvicorn `ai-movie-api` |

服务器路径约定：`/opt/ai_movie`。Postgres/Redis 走本机 Docker（端口 `15432` / `16379`，与旧 kepu 隔离）。

---

## 1. 发布前检查

1. 本地改动已提交（或明确要打进本次包的未提交文件）。
2. 确认 **不要**用 `deploy/scripts/upload_oss_web.py` 代替站点发布。
3. 生产前端构建必须 `VITE_API_BASE=`（空，同源）；禁止把本地 API 地址打进 dist。
4. Celery 需监听队列：`pipeline,oss`。

---

## 2. 标准全量发布（推荐）

凭据与脚本在本机 **gitignore** 文件中：

```text
deploy/scripts/deploy_kepu.py
```

在仓库根目录执行：

```bash
# Windows
python deploy/scripts/deploy_kepu.py
```

脚本会：

1. 打包源码（排除 `.venv` / `node_modules` / `dist` / 生成媒体等）
2. SSH 上传并解压到 `/opt/ai_movie`（保留远端 venv / node_modules）
3. 写入 compose env、`backend/.env`、systemd、nginx（含前台 + admin）
4. `docker compose up -d`（Postgres/Redis）
5. `pip install -r requirements.txt`
6. `frontend`：`npm ci && VITE_API_BASE= npm run build`
7. `admin`：`npm ci && npm run build`
8. 重启 `ai-movie-api` / `ai-movie-worker`，reload nginx
9. 为 `admin.kepu.printfilm.com` 申请/续签证书（certbot，幂等）
10. 健康检查：`/api/health`、前台与后台首页

**注意**：全量脚本会覆盖远端 `backend/.env` 为脚本内嵌模板。若线上临时改过密钥/回调，发布后核对 EPAY / CORS / OSS 等项。

---

## 3. 热修（小改动）

仅改后端个别文件时，可 SSH 上传文件后：

```bash
systemctl restart ai-movie-api.service
# 若改了 worker / celery 任务
systemctl restart ai-movie-worker.service
```

仅改前端时，在服务器：

```bash
cd /opt/ai_movie/frontend && npm ci && VITE_API_BASE= npm run build
# nginx 静态根已指向 dist，一般无需 reload
```

仅改 admin：

```bash
cd /opt/ai_movie/admin && npm ci && npm run build
```

模板封面 seed 若已上传 OSS，启动时勿反复同步上传（`seed_templates` 会跳过已有 https 封面），避免卡住 API 启动。

---

## 4. 服务与排障

| 单元 | 说明 |
|------|------|
| `ai-movie-api.service` | uvicorn `127.0.0.1:8000` |
| `ai-movie-worker.service` | celery `-Q pipeline,oss` |
| `ai-movie-pg` / `ai-movie-redis` | Docker |

常用命令：

```bash
systemctl status ai-movie-api ai-movie-worker
journalctl -u ai-movie-api -n 80 --no-pager
curl -fsS http://127.0.0.1:8000/api/health
curl -fsSI https://kepu.printfilm.com/ | head
curl -fsSI https://admin.kepu.printfilm.com/ | head
```

API 起不来时优先看：启动 seed 是否卡在 OSS、双 worker `create_all` 竞态、`.env` 是否被覆盖。

---

## 5. 易支付（充值）注意

- `EPAY_PID` / `EPAY_KEY` 与开发环境一致即可（见本机 `backend/.env`，勿写入公开文档）。
- **`EPAY_NOTIFY_URL` 不能含 `/api/`**：`pay.gitcc.com` 防火墙会拦含 `/api/` 的回调 URL。
- 生产使用：`https://kepu.printfilm.com/epay/notify`
- nginx 将 `location = /epay/notify` 反代到 `http://127.0.0.1:8000/api/billing/epay/notify`

---

## 6. 发布后必须写记录

每次发布（全量或热修）在 [`docs/releases/`](./releases/) **追加一条**记录，并更新该目录索引。

模板与约定见 [releases/README.md](./releases/README.md)。
