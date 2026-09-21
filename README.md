# PRINTFILM

[![GitHub stars](https://img.shields.io/github/stars/yi1108/printfilm?style=social)](https://github.com/yi1108/printfilm)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

> **把故事做成能播的片子** — AI 漫剧与 AI 短视频，从文案到成片。

模板驱动的创作平台：主题 / 剧本 → 分镜 → 生图 → 生视频 → 成片。口播由 Seedance 出片时生成，无需单独配音。

**源码**：[github.com/yi1108/printfilm](https://github.com/yi1108/printfilm) · **版本** 0.2.0

## 界面预览

**工作台**

![工作台](docs/images/image-20260910-home.png)

**AI 短视频** — 历史、分镜、成片

| 项目历史 | 分镜工作台 | 成片预览 |
|:---:|:---:|:---:|
| ![科普历史](docs/images/image-20260910-history.png) | ![分镜工作台](docs/images/image-20260910-studio.png) | ![成片预览](docs/images/image-20260910-preview.png) |

**AI 漫剧** — 项目、分集、剧本、分镜、资产

| 项目列表 | 分集工作台 | 剧本解析 |
|:---:|:---:|:---:|
| ![漫剧项目列表](docs/images/image-20260917-drama-list.png) | ![分集工作台](docs/images/image-20260917-drama-episode.png) | ![剧本解析](docs/images/image-20260917-drama-script.png) |

| 分镜编辑 | 资产库 | 管理后台 |
|:---:|:---:|:---:|
| ![分镜编辑](docs/images/image-20260917-drama-storyboard.png) | ![漫剧资产库](docs/images/image-20260917-drama-assets.png) | ![管理后台](docs/images/image-20260910-admin.png) |

## 核心功能

### 1. AI 漫剧

从一句话到分集成片，角色与场景可复用。

- 大纲 / 剧情摘要 / 剧本内容
- 资产库：角色、场景、道具
- 解析成镜后进入分镜编辑与画布
- 细则见 [docs/EPISODE_RULES.md](docs/EPISODE_RULES.md)

### 2. AI 短视频

选模板后沿分镜流水线出片，适合获客与科普。

- 20+ 内置风格模板
- `full`（图 + 视频 + 合成）或 `image_text`（静图，更快更省）
- 单镜重绘、重生视频；任务离开页面也会继续跑
- 成片由 FFmpeg 合成

### 3. 工具中心

不走完整流水线的单点能力：文生图、图生图、图生产品、文生视频、视频生视频、电商拼图。

### 4. 管理后台与开放 API

用户、订单、模板、任务中心、模型路由。开放接口 `/api/v1` 生图 / 生视频（Bearer 或 `X-Api-Key`）。

## 工作流程

```
输入主题或剧本
    → 分镜
    → 生图
    → 生视频（Seedance 自带口播）
    → FFmpeg 合成成片
```

每个阶段都可以回头重做单镜；进度在历史页查看。

## 技术特点

- **两条产品线共用一套生成能力** — 漫剧与短视频走同一上游
- **进程内任务平台** — scheduler / executor / poller，无需单独 Celery Worker
- **模型可换** — 管理后台配置 TokenFree Key 与模型，不必改代码
- **Docker 一键启动** — 公开镜像，拉取无需登录
- **可选计费** — 默认关闭；开启后按用量结算，见 [docs/BILLING.md](docs/BILLING.md)

## 技术栈

| 层 | 选型 |
|----|------|
| 后端 | Python 3.12 · FastAPI · SQLAlchemy · PostgreSQL · Redis |
| 前端 | React 19 · TypeScript · Vite 8（管理端 Tailwind + shadcn） |
| AI | TokenFree New API（文字 / 图 / 视频） |
| 部署 | Docker 全栈镜像，或本机三进程 + 中间件容器 |

## 快速开始

本机只需 Docker。ACR `gcc` 公开命名空间，**拉取无需登录**。

```bash
git clone https://github.com/yi1108/printfilm.git
cd printfilm

cp deploy/.env.docker.example deploy/.env.docker
# 改 POSTGRES_PASSWORD、SECRET_KEY；填入 TokenFree Key
# OPENAI_API_KEY 与 ARK_API_KEY 可用同一把

docker compose --env-file deploy/.env.docker up -d
```

| 服务 | 地址 |
|------|------|
| 用户端 | http://localhost:8080 |
| 管理后台 | http://localhost:8081 |
| API / 文档 | http://localhost:8000 · `/docs` |
| 健康检查 | http://localhost:8000/api/health |

| 角色 | 怎么拿 |
|------|--------|
| 普通用户 | `/auth` 邮箱注册 |
| 管理员 | 先注册 → `ADMIN_BOOTSTRAP_EMAILS=你的邮箱` → `docker compose --env-file deploy/.env.docker up -d --force-recreate api`（**不会造号**） |

无 Key 可先看界面：`ARK_MOCK=true`。仓库无内置演示账号；生产请立刻改掉密钥。

**更新镜像**

```bash
docker compose --env-file deploy/.env.docker pull
docker compose --env-file deploy/.env.docker up -d
```

**从源码构建**（改过前后端 / 拉不到 ACR 时）：

```bash
docker compose --env-file deploy/.env.docker -f docker-compose.full.yml up -d --build
```

## AI 配置

开源版文字 / 图 / 视频统一走 **TokenFree**（`https://www.tokenfree.com/v1`）。可在管理后台 **系统设置 → 模型** 填 Key；也可写进 `deploy/.env.docker`：

```env
OPENAI_API_KEY=sk-你的密钥
OPENAI_BASE_URL=https://www.tokenfree.com/v1
ARK_API_KEY=sk-你的密钥
MODEL_LLM=kimi-k2.6
MODEL_IMAGE=doubao-seedream-5-0-260128
MODEL_VIDEO=doubao-seedance-2-5-260628
```

## 适用场景

- 短视频 / 获客片：把卖点做成可投放的短片
- 漫剧 / 短剧：从大纲到分集，角色场景保持一致
- 单点出图出片：工具中心直接生成
- 自托管：Docker 拉镜像即可在自己的机器上跑

## 目录结构

```
backend/                  FastAPI、流水线、计费、任务运行时
frontend/                 用户端
admin/                    运营后台
deploy/                   环境变量示例、中间件 compose
docs/                     规范与专题文档
docker-compose.yml        拉公开镜像一键启动
docker-compose.full.yml   从源码构建
```

## 社区

- GitHub：https://github.com/yi1108/printfilm
- 微信加 **`gitpp88`**（备注「入群」）：部署答疑 / 短剧交流 / 模板分享

## Star History

[![Star History Chart](https://api.star-history.com/chart?repos=yi1108/printfilm&type=date&legend=top-left)](https://www.star-history.com/#yi1108/printfilm&Date)

## 更多文档

| 文档 | 内容 |
|------|------|
| [docs/STANDARDS.md](docs/STANDARDS.md) | 工程规范 |
| [docs/BILLING.md](docs/BILLING.md) | 计费与易支付 |
| [docs/EPISODE_RULES.md](docs/EPISODE_RULES.md) | 漫剧分集 |
| [docs/SEEDANCE_2_5.md](docs/SEEDANCE_2_5.md) | Seedance 参数 |
| [deploy/README.md](deploy/README.md) | 本机中间件与运维 |

## 贡献

欢迎 Issue / PR。提交前对照 [docs/STANDARDS.md](docs/STANDARDS.md)：简体中文文案、函数注释、服务端分页；勿提交 `.env`、密钥与生成媒体。

```bash
cd frontend && npm run lint
cd ../admin && npm run lint
cd ../backend && pytest
```

## 开源许可

本项目采用 [MIT License](LICENSE)。
