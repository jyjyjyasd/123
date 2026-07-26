# PosterForge v0.4 产品需求文档 (PRD)

> **Poster Forge** 是一个供公司全体同事自助生成视觉物料的内部 Web 应用。
> 
> **v0.4 核心变更**：引入「AI 设计助理（Agent）」模式，将原独立 Agent 项目的“双流拆解 + 多轮确认”工作流完全融入现有的 PosterForge 基础设施中。形成「快速生成」与「AI 设计助理」双模式并存的产品形态。

---

## 1. 背景与目标

### 1.1 为什么做
- **已有基础**：PosterForge 已经具备了快速出图（基于 FastAPI + Vite）的能力，支持多尺寸、画质选择、参考图编辑以及图片管理闭环。
- **用户痛点**：对于无设计背景的用户，直接编写高质量的 Prompt（提示词）难度较高。单纯的“快速生成”模式在处理复杂需求（需要结合多张参考图、复杂的排版要求、特定的主视觉风格）时往往效果不佳，反复尝试成本高。
- **整合目标**：将此前经过验证的「AI 海报 Agent」核心逻辑（状态机、结构化多步确认、去字反推风格）移植到 PosterForge 中，复用其登录、历史、图片上传、代理请求等基础设施，提供手把手的交互式对话设计体验。

### 1.2 目标与非目标
**目标（Phase 1 整合）：**
- 实现「快速生成」与「AI 设计助理」的双轨制工作区。
- Agent 模式提供：需求收集、两次确认机制、视觉与排版拆解分析、多尺寸延伸。
- 技术栈保持不变，Agent 引擎完全本地化（不依赖外部 Coze/Dify 等平台），由后端 Python 代码重写编排逻辑。

**非目标：**
- Docker 部署、内网 HTTPS、生产级数据库（Postgres）（继续延后至 Phase 2）。

---

## 2. 用户与场景

### 2.1 目标用户画像
| 画像 | 关键诉求 | 适用模式 |
|---|---|---|
| **无设计背景（多数）** | 缺乏提示词编写经验，有大致的业务意图或参考图，需要引导才能说清需求。 | **AI 设计助理 (Agent Mode)** |
| **有设计基础/熟手（少数）** | 清楚自己要什么，自带精准 Prompt 和明确的编辑目的，追求效率。 | **快速生成 (Fast Mode)** |

### 2.2 场景示例
- **场景 A（Agent模式）**：市场部同事要发活动海报，手上只有一段活动文案和一张网上找的“赛博朋克风”图片。他进入 AI 助理，丢入内容。助理帮他分析并提炼出赛博朋克风格描述，并询问尺寸和排版意图，通过两次结构化卡片确认后，生成高保真海报。
- **场景 B（Fast模式）**：平面设计师需要一张“极简留白”的背景图做素材，直接进入快速生成，输入 `minimalist white background, soft lighting, 4k`，10秒出图下载。

---

## 3. 功能规格

### 3.1 核心工作流 1：快速生成模式 (Fast Mode)
*（沿用 v0.3 原有逻辑）*
- **生成/编辑**：单步提交。输入 Prompt、选择尺寸比例（7档）、清晰度（1K/2K/4K）和最多5张参考图。
- **提交与等待**：前端轮询获取进度，直接渲染出图，无打扰。

### 3.2 核心工作流 2：AI 设计助理模式 (Agent Mode)
由后端 `skill_runner.py` 驱动的有限状态机交互流，状态全集为 `init → clarifying_strategy → clarifying → prompting → generating → review → done | failed`。

**第一轮：需求收集与策略澄清 (`init` → `clarifying_strategy` → `clarifying`)**

1. **初始审计 (`init`)**
   - 用户首次输入后，后端调用 `audit_user_intent()` 审计输入是否包含「定位 + 作用」。
   - 若信息不足 → 进入 `clarifying_strategy`，Agent 追问"请问您需要设计什么定位和核心作用的海报？"，前端展示快捷回复按钮（`quick_replies`）。用户回复后，`extract_strategy_from_reply()` 提取策略信息，然后转入 `clarifying`。
   - 若信息充分 → 跳过 `clarifying_strategy`，直接进入 `clarifying`。
2. **结构化澄清 (`clarifying`)**
   - 后端调度 LLM 将用户输入规整为结构化数据，输出 `stream_a`（主视觉描述、文案 copy、排版推荐 layout_recommendations）和 `stream_b`（风格推荐 style_recommendations）。
   - 前端渲染 **Stage 1 确认卡片**：展示解析后的主视觉风格、文案、排版推荐、风格推荐（可刷新）。用户可原地编辑风格描述、选择推荐风格、切换排版。

**第二轮：最终确认与编译 (`prompting`)**

3. **视觉与排版确认 (`prompting`)**
   - 用户在 Stage 1 确认后，后端再次调用 LLM 输出最终编排结果（`stream_a` 的 copy/layout 锁定 + `stream_b` 的 visual_description 等）。
   - 前端渲染 **Stage 2 确认卡片**：展示最终视觉效果方向（最终风格、最终文案、当前排版）。用户可点击「刷新风格」重新推荐、切换推荐排版、点击「文案刷新」重新生成文案。
   - 用户点击「确认生成」后进入下一步。

**第三轮：生成与审查 (`generating` → `review` → `done`)**

4. **生成 (`generating`)**
   - 后端调用 `prompt_compiler.py` 编译 `final_prompt`，创建 `Generation` 记录，触发 `run_generation_job` 异步生图。
   - 前端轮询 `GET /api/generations/{id}` 直到完成。
5. **审查 (`review`)**
   - 画布展示成品，允许导出 PNG/PDF。
6. **完成 (`done`)**
   - 用户确认满意后标记完成。

**多尺寸延伸 (`/extend`)**
   - 在 `review` 或 `done` 状态，用户可点击「多尺寸延伸」弹出 `ExtendModal`，选择目标比例和清晰度（2K/4K），并发提交多个 Generation 任务，后台异步执行并实时回写结果。
   - 同时支持**高清超分**：通过 `ResolutionExtendModal` 在已有版本组内将 1K 升级到 2K/4K。

### 3.3 历史记录与管理
- **历史画廊**：混合展示快速生成与 Agent 模式的成果。
- **复用**：Agent 生成的图，支持复用其最终编译好的 Prompt 重新生成。
- **变体画廊 (`VariantGallery`)**：在一个 Agent Session 中生成的多个图片变体或延伸尺寸，聚合展示。

---

## 4. 交互与 UI 设计 (Notion 风格)

设计系统严格遵循 Notion 审美：低饱和度、重层级、轻阴影、hover 背景色反馈。

### 4.1 页面布局规划
**`/` 工作台**：左右分栏结构（左 40% 输入区 + 右 60% 结果区）。
- **顶部 Tab 切换**：「AI 设计助理」 / 「快速生成」 / 「修图」。

#### 快速生成界面 (左栏)
- 纯净表单：多行文本框、尺寸/清晰度分段控件、拖拽上传虚线框。

#### AI 设计助理界面 (左栏 `AgentChat` + 右栏 `CanvasArea`)
- **左侧对话流**：
  - 支持 SSE 流式打字输出。
  - 特殊卡片：`ChatBubble` 解析结构化消息 `[[SECTION:xxx]]` 渲染为美观的属性区块。
  - 确认机制：当进入 Confirm 状态，最后一条消息变为醒目的 `ConfirmCard`（两轮确认），包含“核对”与“确认执行”按钮。
- **右侧画布区**：
  - 三态渲染：对话初期的空状态 → generating 时的加载骨架 → 出图后的 `ImageViewer`。
  - 附带右侧属性对照面板（`ParamsPanel`）。

### 4.2 核心前端组件清单
- `AgentChat.tsx`: 承载对话流。
- `ChatBubble.tsx`: 渲染 Agent 结构化文本片段。
- `ConfirmCard.tsx`: 两轮强制确认卡片。
- `CanvasArea.tsx`: 核心画板展示。
- `ExtendModal.tsx`: 多尺寸批量生成触发器。
- `VariantGallery.tsx`: Session 历史版本缩略图。

---

## 5. 系统架构与技术规格

### 5.1 技术栈基座
- **前端**：Vite 5 + React 18 + TailwindCSS + shadcn/ui + TanStack Query
- **后端**：Python 3.12 + FastAPI + SQLAlchemy 2.0 + httpx
- **数据库/存储**：SQLite (`backend/data/posterforge.db`) + 本地文件系统

### 5.2 后端 Agent 模块架构
在原有的 `fastapi` 基础路由外，新增 `agent/` 领域驱动目录：

- **`agent/skill_runner.py`**: 核心状态机引擎。管理会话的流转 (init → clarifying_strategy → clarifying → prompting → generating → review → done | failed)。
- **`agent/llm_client.py`**: 基于双流拆解法调用大模型，解析用户自然语言需求。包含 System Prompt 构建、`stream_chat` 流式对话、`audit_user_intent` 输入审计、`extract_strategy_from_reply` 策略提取。
- **`agent/info_grouper.py`**: 将零散信息分类整合。
- **`agent/layout_processor.py`**: 解析文案层级和排版。
- **`agent/prompt_compiler.py`**: 150行纯函数。根据 stream_a/stream_b 结果编译最终直接丢给生图 API 的 Prompt。
- **`agent/pdf_helper.py`**: PDF 文件解析（pymupdf），支持提取全部文案 + 首页光栅化转 PNG。

### 5.3 数据流与生图集成
- Agent 生成请求最终通过 `sessions/{id}/generate` 调用已有的 `proxy.run_image_generation`，**完美复用**已存在的重试机制、错误拦截、apimart 代理对接和本地文件写入逻辑。

---

## 6. 数据库设计扩展

在现有 `users`, `generations`, `files` 基础上，新增 Agent 专用会话表：

```sql
CREATE TABLE agent_sessions (
    id                TEXT PRIMARY KEY,
    user_id           TEXT NOT NULL REFERENCES users(id),
    status            TEXT NOT NULL,            -- init | clarifying_strategy | clarifying | prompting | generating | review | done | failed
    aspect_ratio      TEXT,                     -- 解析出的比例
    resolution        TEXT,                     -- 解析出的清晰度 (1k|2k|4k)
    clarify_messages  TEXT,                     -- JSON: 聊天上下文记录
    stream_a          TEXT,                     -- JSON: 主视觉与排版中间态数据
    stream_b          TEXT,                     -- JSON: 二次确认后的最终编排数据
    final_prompt      TEXT,                     -- 最终编译的提示词
    negative_prompt   TEXT,                     -- 负向提示词
    generation_id     TEXT REFERENCES generations(id), -- 最终关联的生图记录
    primary_ratio     TEXT,                     -- 主海报生成时的比例 (与 extend 区分)
    primary_resolution TEXT,                    -- 主海报生成时的清晰度
    extended_images   TEXT,                     -- JSON: 多尺寸延伸结果 [{ratio, generation_id, url, resolution, status, ...}]
    archived_images   TEXT,                     -- JSON: 历史版本分组 [{batch_id, created_at, core_strategy, text_outline, primary_image, extended_images}]
    error_message     TEXT,                     -- 失败时的错误信息
    created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at        TIMESTAMP,
    deleted_at        TIMESTAMP
);
```
**设计优势**：`agent_sessions` 作为过程追踪记录，最终生成的图片统一写入 `generations` 表，从而保证原有的 /history 和 /admin 统计功能无需修改即可显示 Agent 生成的成品图片。

---

## 7. 内部 API 契约增量

`/api/agent/sessions` 路径组：

- `POST /sessions`：初始化对话 Session。
- `GET /sessions`：获取当前用户的所有 Agent 会话列表。
- `GET /sessions/{id}`：拉取 Session 当前状态机、图片和消息记录。
- `PATCH /sessions/{id}`：前端内联编辑后同步参数（aspect_ratio / resolution / stream_a / stream_b / extended_images）。
- `DELETE /sessions/{id}`：软删除会话。
- `POST /sessions/{id}/clarify`：(SSE) 核心对话端点，处理用户输入，驱动状态机流转。
- `POST /sessions/{id}/compile`：编译最终 prompt。
- `POST /sessions/{id}/generate`：触发最终代理出图调用（异步 BackgroundTasks）。
- `POST /sessions/{id}/extend`：触发多尺寸延伸（并发提交，异步回写）。
- `POST /sessions/{id}/refresh-styles`：刷新风格推荐（带去重逻辑）。
- `POST /sessions/{id}/upload`：上传参考图文件（复用 /api/uploads 逻辑）。
- `POST /sessions/{id}/refresh-copy`：刷新文案推荐。

---

## 8. 里程碑实施计划

| 阶段 | 交付任务 | 状态 |
|---|---|---|
| **Phase 1: 基础设施** | 建立 `agent_sessions` 表、完成 `skill_runner.py` 状态机与 LLM Client 封装。 | ✅ 已完成 |
| **Phase 2: 核心工作流** | 实现信息分类（`info_grouper`）、排版处理（`layout_processor`）、Prompt 编译（`prompt_compiler`）、PDF 解析（`pdf_helper`）。 | ✅ 已完成 |
| **Phase 3: 前端 UI** | 搭建 `AgentWorkspace`（对话+画布编排）、`ChatBubble`（结构化消息+原地编辑）、`ConfirmCard`（两阶段确认卡片）、`CanvasArea`（三态渲染+变体画廊）、`ExtendModal`/`ResolutionExtendModal`。 | ✅ 已完成 |
| **Phase 4: 联调闭环** | 对接 `run_image_generation`、实现多尺寸 `extend_poster_parallel`（并发提交异步回写）、版本归档系统（`archived_images`）、历史画廊整合。 | ✅ 已完成 |

**当前状态**：v0.4 Agent 模式已完整实现并投产。后续迭代为体验优化和 Bug 修复（见 `开发文档.md` 中的迭代记录）。

---

## 9. 当前任务状态 (2026-06-25)

**整体进度**：v0.4 四阶段全部完成，项目处于**稳定迭代期**。

**最近一批迭代（2026-06-12 ~ 2026-06-22）**：
- 9:32 尺寸的全链路适配（排版兜底、加载优化、缩略图标签、滚动圆角裁切）
- PDF 上传解析支持（提取文本 + 首页转图）
- 当前风格/排版卡片的原地可编辑重构
- 风格刷新去重 & 缓存修复
- 高清重绘 & 多尺寸延伸的任务隔离与失败处理
- 工作台（资产库）多版本同步 & 当前版本一键恢复
- 流式对话卡顿优化（SSE 重复 setSession、毛玻璃渲染瓶颈）
- 历史跨会话延伸操作支持

**当前无进行中的大功能**，迭代节奏为响应 Han 的即时需求。

---

## 10. 未来计划 (Phase 2 方向)

以下来自 AGENTS.md §11 的 Out of Scope 列表中标明 "Phase 2 才做" 的项目，当前不实现，仅做远期规划参考：

| 计划项 | 说明 |
|---|---|
| 钉钉 SSO / 邮箱登录 | 替代工号无密码认证 |
| 阿里云 OSS / 对象存储 | 替代本地磁盘存储 |
| Postgres / 容器化 | 替代 SQLite，支持 Docker 部署 |
| 配额与预算管控 | 按用户/部门限流 |
| 素材库 / 品牌资产 | DAM 系统集成 |

**Phase 2 启动前需要确认**：上述列表可能随业务需求调整，以 Han 的最新决策为准。



