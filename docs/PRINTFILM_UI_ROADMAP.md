# PRINTFILM UI 还原与后续路线图

本文档对应 6 张设计图的前端还原结果：已接线能力、占位能力与建议迭代顺序。

## 路由与设计图对应

| 设计图 | 路由 | 页面组件 |
|--------|------|----------|
| 首页 | `/` | `frontend/src/pages/HomePage.tsx` |
| 新建项目 | `/studio/new` | `frontend/src/pages/studio/CreateProjectPage.tsx` |
| 风格配置 | `/studio/:id/style` | `frontend/src/pages/studio/StyleConfigPage.tsx` |
| 分镜工作台 | `/studio/:id` | `frontend/src/pages/studio/StoryboardPage.tsx` |
| 成片编辑器 | `/studio/:id/editor` | `frontend/src/pages/studio/EditorPage.tsx` |
| 我的项目 / 历史 | `/history` | `frontend/src/pages/HistoryPage.tsx` |
| 模板库 | `/templates` | `frontend/src/pages/TemplatesPage.tsx` |
| 定价 | `/pricing` | `frontend/src/pages/PricingPage.tsx` |

兼容旧入口：`/studio?project=` → `/studio/:id`；`/studio?template=` → `/studio/new?template=`。

共享壳层：`SiteNav` / `AppShell`（`frontend/src/components/layout/`），样式 token 见 `frontend/src/index.css` 与 `frontend/src/styles/printfilm.css`。

## 已实现（接线现有 API）

- 登录 / 注册 / 顶栏用户态
- 模板列表、分类筛选、从模板进入创作
- 创建项目（主题 / 完整文案）→ 风格配置 → `generate` 启动流水线
- 风格：切换模板预设、风格/角色提示词、音色、`pipeline_mode`（16:9 全链路 / 9:16 图文）
- 分镜台：进度轮询、分镜表、编辑镜头、重绘/重生视频/重配音、继续生成、合成、预览成片、发布
- 编辑器：场景列表、预览真实媒体、保存旁白、重绘、重配音
- 历史：列表、状态筛选、搜索、继续编辑、预览、删除、批量 zip 下载
- 公开作品展示（首页）

## 占位功能（UI 已出 / 禁用或「即将推出」）

按页面列出，供后续迭代实现。

### 全局顶栏

1. 福利 / 礼物入口
2. 帮助中心
3. 通知中心
4. 用户资料下拉（当前点击头像为退出）

### 首页

1. 「查看全部作品」独立社区页
2. Hero 右侧真实 Demo 成片播放（当前为模板封面示意）
3. 作品卡片播放量 / 点赞 / 作者信息

### 新建项目

1. 导入文章链接解析
2. 上传文档（PDF/Word/TXT）
3. 灵感示例「换一批」个性化推荐
4. 预估时长精确计算
5. 「加载更多模板」分页

### 风格配置

1. 「更多风格」商店 / 付费风格包
2. BGM 曲库、波形预览、音量
3. 字幕字体工具条（字号/对齐/颜色）
4. 实时成片预览（非模板封面）
5. 1:1 / 4:3 / 21:9 独立合成管线（当前非 9:16 暂映射全链路）

### 分镜工作台

1. ~~批量调整分镜~~（已实现：统一时长 + 可选重配音）
2. ~~导出分镜脚本（CSV）~~
3. ~~更换封面上传 / 用首镜封面~~
4. 真正的「结构摘要」模型字段（当前由镜头旁白聚合示意）
5. 大纲独立生成与编辑

### 成片编辑器

1. 撤销 / 重做 / 保存草稿
2. 导出视频多格式 / 多平台封装
3. 添加镜头、拖拽调序
4. 素材库 / 收藏 / 上传 / 拖拽替换
5. AI 优化文案
6. 字幕样式与位置网格
7. 转场效果
8. 「应用到全部同类镜头」

### 历史 / 我的项目

1. 统计环比（较上月 ↑）真实数据
2. 本月时长 / 额度条后端计量
3. 快速发布：复制链接、二维码、嵌入
4. 平台一键导出（抖音 / B 站 / 小红书 / 视频号 / YouTube）
5. 「已发布」与「已完成」状态区分（当前均映射 DONE）
6. 分页组件

### 定价

1. 套餐 SKU、支付、额度扣减

## 建议迭代优先级

1. **P0**：编辑器旁白保存 + 分镜重生闭环体验打磨；合成失败可恢复提示
2. **P1**：BGM 选曲接入合成；字幕样式最小集；封面上传
3. **P1**：素材库（本地上传替换镜头图）
4. **P2**：平台导出 / 分享链接；通知中心
5. **P2**：额度与定价；社区作品流
6. **P3**：转场、时间线精修、批量调整、文档/链接导入

## 视觉约定

- 主色石灰绿：`#B6FF00`（`--pf-lime`）
- 背景：`#F7F8FA`（`--pf-bg`）
- 卡片白底、圆角约 14px、轻阴影
- 顶栏居中导航 + 右侧「开始创作」

字体：Space Grotesk（品牌英文）+ Noto Sans SC（正文，近似设计稿思源黑体）。
