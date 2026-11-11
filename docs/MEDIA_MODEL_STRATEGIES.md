# 图视频模型策略与站内定价

模型能力由 `backend/app/services/media_models/` 内的十五个策略定义（TokenFree 九个 + PiAPI 六个，见下文「PiAPI 上游」）。前台目录、参数校验、请求转换、报价和任务受理共用这些策略。图片按模型、分辨率、成功交付张数收费；视频按模型、分辨率、提交的生成秒数收费。每张/条向上取整到分后汇总，单价使用四位小数的 Decimal 元。

科普项目新增 `image_resolution`、`video_resolution`，可在风格配置页按模型选择。历史项目字段为空时仍使用原图像尺寸及站点视频清晰度规则；显式设置的视频分辨率优先于旧 `preview/hd` 推导。

## 发布与兼容

数据库迁移是发布的前置条件。`DATABASE_BOOTSTRAP_ENABLED=false` 时，启动 API 不会自动补齐数据库结构；不能以进程启动成功或 `/api/health` 返回正常代替迁移验收。即使环境开启启动建表，上线仍按以下顺序显式执行并校验。

1. 备份目标数据库，确认本次发布使用的代码版本、数据库目标及恢复方案。
2. 使用**目标环境数据库凭证**，在本次发布代码的 `backend` 目录、该环境的 Python 虚拟环境内执行迁移。Windows 示例：`.venv/Scripts/python.exe scripts/prepare_media_schema.py`。脚本幂等创建媒体价格版本表、补齐下表七列及交付去重唯一索引，不重算历史账单。
3. 在相同环境执行 `.venv/Scripts/python.exe scripts/prepare_media_schema.py --check`，确认退出码为 `0`。该模式只读检查必需表、列及交付唯一索引，缺失时退出码为 `1`；迁移命令本身也会在完成后自动校验。**迁移或校验失败，停止发布，不继续重启 API/Worker。**
4. 校验通过后，再更新并重启 API、Worker，部署前端及管理端。未发布价格时继续使用原计费；新受理的媒体任务仍会保存参数和固定路由。
5. 使用有权限的账号，对目标环境中实际存在且可访问的项目执行认证业务接口冒烟：读取项目、读取分集、读取任务列表，并检查返回数据和服务日志。分集接口示例为 `GET /api/drama/episodes?project_id=<目标项目ID>`；验收需确认 HTTP 200 且返回结构和数据符合预期，不能只检查 `/api/health`。
6. 在发布记录中保存备份标识、迁移与 `--check` 的结果、发布版本及业务冒烟结果。以上任一步骤失败均不得继续发布或开放新版本流量。

| 数据表 | 新增字段或结构 |
|---|---|
| `projects` | `image_resolution`、`video_resolution` |
| `task_runs` | `billing_snapshot`、`media_provider_tasks` |
| `usage_events` | `billing_detail`、`delivery_key`、`cost_status`；`uq_usage_delivery_key` 交付唯一索引 |
| `media_price_versions` | 不可变媒体价格版本表 |

价格发布是独立操作，不以“尚未开启固定价格”为由省略上述结构迁移。在管理端「支付与计费 → 图片与视频价格」检查初始草稿，填写要开放的分辨率单价，再发布版本。草稿是当前旧规则的换算参考，不代表价格已生效；留空的分辨率不开放生成。价格发布立即影响新受理任务。停用固定计费只影响新任务；已受理任务继续使用自己的策略、价格、路由快照。旧历史任务、历史账单不重算。

回滚应用时，必须保留新版本任务的执行与结算代码，先停用新任务固定计费并等在途任务结束；不能用不识别快照的旧 Worker 处理新任务。后续升级模型策略需要保留在途任务使用的策略版本。

### 2026-10-24：漏执行数据库迁移导致分集查询 500

- **现象**：本地 `GET /api/drama/episodes?project_id=422` 返回 500，日志出现 `UndefinedColumnError`，缺少 `task_runs.billing_snapshot` 等字段。此项目 ID 仅用于记录本次复现，上线冒烟应选择目标环境中有权限访问的项目。
- **原因**：本地设置 `DATABASE_BOOTSTRAP_ENABLED=false`，代码已包含媒体计费重构，但目标库未执行配套增量迁移，七个新增字段、媒体价格版本表及交付唯一索引未准备齐全。业务查询会读取新增 ORM 字段，因此即使未发布价格，也会受影响。
- **修复**：在本地目标库执行 `backend/scripts/prepare_media_schema.py` 补齐结构。修复后，同一接口连续两次返回 200，均正常读取 12 集；相关回归测试 16 条通过。本次验证不代表生产环境已经迁移。
- **防复发**：将“备份 → 目标库迁移 → `--check` 成功 → 重启 API/Worker → 认证业务接口冒烟”固定为上线顺序；失败即停止。记录检查结果，禁止仅凭健康检查或服务成功启动判定发布完成。

## 固定路由

任务每项操作锁定渠道 ID、上游模型、协议与地址，不保存 API Key。执行、轮询、下载沿用原渠道，并读取该渠道当前有效凭证；渠道停用或凭证失效时明确失败，不切换其他渠道或模型。

视频请求成功返回任务号后，按操作记录在 `task_runs.media_provider_tasks`；恢复执行复用原任务号。轮询或下载故障不会创建新视频任务，也不剥离参考音频重新生成。用户手动重试创建新任务，使用重新确定的路由和价格。

## 交付与成本

- 结果保存到受管存储并关联业务记录后计费；图片批量中间结果也保存到任务结果，后续失败只扣已交付项。
- 交付键按任务、生成操作和结果身份去重，数据库唯一索引与任务行锁共同防止重复收费。不同镜头或不同图片不会被按任务整体去重。
- 无交付失败/取消全额解冻；部分交付按成功明细扣费。内部工具生成并交付的首帧图片另按图片价计费，报价和冻结包含该项。
- `charge_fen` 是站内售价；`cost_fen` 是上游成本。上游没有返回费用时成本为待核实，不能把待核实的 0 当免费成本。New API 对账只更新新计费行的成本，不能修改用户实扣。
- LLM、TTS 及团队所有者付款、成员月额度继续沿用现有规则。

## 接口

| 接口 | 用途 |
|---|---|
| `GET /api/media-models` | 策略能力、可用档位、站内价格、价格版本 |
| `POST /api/billing/media/quote` | `{items: [{model_id, params}], price_version?}`，返回单项及总报价 |
| `GET /api/admin/settings/billing/media-prices` | 生效/停用状态、价格表或初始草稿、策略能力 |
| `POST /api/admin/settings/billing/media-prices` | `{prices: {model_id: {resolution: "元单价"}}, expected_version}`，发布不可变新版本 |
| `PATCH /api/admin/settings/billing/media-prices/activation` | `{enabled, expected_version}`，切换新任务计费模式 |

前端生成请求携带 `X-Media-Price-Version`（旧模式目录为 0）。价格或模式发生变化返回 409，在建任务、冻结资金、提交上游之前结束。刷新目录后由用户重新提交，不自动重发生成请求。

站内图片生成按模型、分辨率和数量报价；视频按模型、分辨率和提交时长报价。模型不支持的组合返回字段错误，不自动降档。

## PiAPI 上游

管理端「系统设置 → 模型 → 上游网关」可切到 PiAPI（另两个选项为 TokenFree、9Router），保存后立即生效。文本走 PiAPI LLM 接口 `https://api.piapi.ai/v1`；图片、视频走统一任务接口 `POST /api/v1/task` + 轮询，代码在 `backend/app/services/piapi/`。

| 策略 | 能力 | 分辨率 | 时长 | 参考素材 |
|---|---|---|---|---|
| `flux1-dev` / `flux1-schnell` | 图片 | 1K | — | 最多 1 张（img2img） |
| `kling-3.0` | 视频 | 720p（std，默认）/ 1080p（pro） | 3–15 秒 | 只认首帧 + 尾帧 |
| `kling-4.0` | 视频 | 同上 | 3–30 秒 | 只认首帧 + 尾帧 |
| `veo3.1` / `veo3.1-fast` | 视频 | 720p（默认）/ 1080p，仅 16:9、9:16 | 4–8 秒，上游按 4/6/8 秒取档 | 首帧 + 尾帧，或 1–3 张参考图 |
| `seedance-2.5` | 视频 | 与 TokenFree 共用同一策略 | | |

- 预设按上游过滤（`media_model_presets.PRESET_MODELS` 的 `gateways` 字段，管理端 `tokenfreeRecommendedModels.ts` 同步）：PiAPI 下只能选上表模型，TokenFree 专属模型视为停用；切回 TokenFree 后 PiAPI 专属模型同样不可选。渠道 models 始终写入全部预设，切换网关无需重建渠道。
- 开启固定计费时，PiAPI 模型同样要在「图片与视频价格」确认单价并发布，留空的分辨率不开放生成。初始草稿里 PiAPI 专属模型（Flux / Kling / Veo）留空：TokenFree 价目里没有这些模型，不套用通用兜底估价，须按 PiAPI 官网价目（https://piapi.ai/pricing）填写后发布。
- PiAPI 不拉取 TokenFree 官方价目与用量，上游成本记为待核实。
- PiAPI 没有配音接口：语音无预设，配音回退 edge-tts。Midjourney、Sora 2 已被 PiAPI 下线，选用时报错。
