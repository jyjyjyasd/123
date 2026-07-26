# Poster Forge · CLAUDE.md

> `Poster Forge` 是一个供公司全体同事自助生成视觉物料的内部 Web 应用。
> 本文档为 Claude Code 提供项目上下文、技术约束和协作偏好。
> **完整功能规格见 `PRD-PosterForge-v0.3.md`。本文件是 how，PRD 是 what，冲突时 PRD 优先。**

---

## 1. Mission

一句话：让非设计岗位在 60 秒内拿到一张 70~90 分的海报 / banner / 社交图。

**不追求专业级设计**（那是平面部门的事），**追求"可用即可"**。这个定位决定了：能做 A 绝不做 A+B；能用系统默认，不自造组件；能用轮询，不上消息队列。

---

## 2. Tech Stack（Phase 1）

| 层 | 选型 |
|---|---|
| 前端 | Vite 5 + React 18 + TypeScript + Tailwind v3 + shadcn/ui + TanStack Query + React Router |
| 后端 | Python 3.12 + FastAPI + SQLAlchemy 2.0 (async) + Alembic + httpx + Pillow |
| 图像 API | **apimart** (`api.apimart.ai`) gpt-image-2 · 异步任务（提交 → 轮询 → 下载） |
| 数据库 | SQLite · `backend/data/posterforge.db`（WAL 模式） |
| 存储 | 本地磁盘 · `backend/data/uploads/` + `backend/data/outputs/` |
| 认证 | **工号无密码** + itsdangerous 签名 cookie（30 天）。LAN 内信任模型 |
| 运行 | Mac 本机双进程 · Vite 5173 对 LAN，Uvicorn 8000 仅绑 127.0.0.1，`/api` 由 Vite dev proxy 转发 |
| 包管理 | 前端 pnpm · 后端 uv |
| 仓库 | 单仓库 `frontend/` + `backend/` |

> **认证为何不是邮箱**：与 PRD §3.1 偏离 — Han 在 v0.3 落地时决定用工号无密码替代邮箱域名校验。理由：100 张/天的 LAN demo，邮箱+域名校验过重；工号轻、保留个人历史隔离（PRD §10 验收第 7 条仍成立）。Phase 2 切真实 SSO 时这块会整体重写。

---

## 3. Commands

```bash
# 一键启动（推荐）
./start.sh                        # 起后端 + 前端，打印 LAN URL

# 单独启动（开发调试）
cd backend && uv run alembic upgrade head
cd backend && uv run uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
cd frontend && pnpm dev --host 0.0.0.0 --port 5173

# 质量
cd backend && uv run pytest
cd frontend && pnpm typecheck
cd frontend && pnpm lint
cd frontend && pnpm build
```

---

## 4. Project Structure（M2 完成时）

```
.
├── PRD-PosterForge-v0.3.md           # 权威功能规格
├── CLAUDE.md                         # 本文件
├── README.md
├── start.sh
├── docs/
│   └── api_docs/                     # 代理 API 原始文档
│       ├── api_doc_Geenrate.md
│       └── api_doc_edit.md
├── frontend/
│   └── src/
│       ├── pages/                    # login, workspace
│       ├── features/
│       │   ├── auth/                 # hooks, RequireAuth
│       │   └── generation/           # form, params, result, polling
│       ├── components/
│       │   ├── ui/                   # shadcn 原子组件
│       │   └── layout/               # top-nav, app-layout
│       └── lib/                      # api fetch wrapper, query-client, utils
└── backend/
    ├── app/
    │   ├── main.py                   # FastAPI app
    │   ├── config.py                 # pydantic-settings
    │   ├── db.py                     # async engine, WAL pragma
    │   ├── models.py                 # users / generations / files
    │   ├── schemas.py                # pydantic IO
    │   ├── auth.py                   # cookie session + current_user
    │   ├── proxy.py                  # 代理 API 客户端
    │   ├── storage.py                # 本地磁盘读写 + files 表
    │   ├── jobs.py                   # BackgroundTasks 入口 + 重试
    │   ├── errors.py                 # 错误码（PRD §4.7）
    │   └── routers/
    │       ├── health.py
    │       ├── auth.py
    │       ├── generations.py
    │       └── files.py
    ├── alembic/
    ├── tests/
    └── data/                         # 运行时生成，gitignore
```

---

## 5. Style Conventions

### Code
- **Frontend**: TypeScript strict mode；`const` + 箭头函数优先；组件文件 `PascalCase.tsx`；其他 `kebab-case.ts`
- **Backend**: Python 3.12，类型标注必加；FastAPI 路由用 async；SQLAlchemy 2.0 风格（`select()`，不用 query API）
- 错误结构：`{ error: { code: string, message: string } }`，code 用 snake_case
- 不写废话注释，只在 WHY 非显而易见时加一行

### Design tokens
**写 UI 前必读 PRD §5。** 所有色值/字号/圆角通过 Tailwind config 暴露的 token 引用，**不允许**组件里写硬编码 hex。

### UI 硬规则（违反即为 bug — PRD §5.5）
- 主按钮**深色不蓝**：`bg-[#37352F] text-white`
- 圆角按层级：图标按钮 `rounded-md` (6px)、卡片 `rounded-lg` (8) / `rounded-xl` (12)、浮层 `rounded-2xl` (16)
- 不用 `shadow-lg` 及以上
- hover 默认改 `bg`；卡片 / 图标按钮可叠加**轻量** `translate-y ≤ 2px` / `scale ≤ 1.05` / `shadow ≤ shadow-popover`，过渡 ≤ 200ms
- 不用渐变填充、不用亮色大面积背景
- 字体加粗上限 `font-semibold`（600），不用 700+

---

## 6. Environment Variables

见 `backend/.env.example`，真实值写 `backend/.env`（gitignore）。关键变量：

```env
# 图像 API：apimart gpt-image-2（异步 task 模型，见 §7）
APIMART_BASE_URL=https://api.apimart.ai
APIMART_API_KEY=sk-...

# DB
DATABASE_URL=sqlite+aiosqlite:///./data/posterforge.db

# 应用
SESSION_SECRET=                    # 用 python -c 'import secrets; print(secrets.token_urlsafe(32))' 生成
ADMIN_WORK_IDS=                    # 逗号分隔的工号白名单（管理员面板用，M5 才用）
SESSION_MAX_AGE_SECONDS=2592000    # 30 天
```

新增变量时同步更新 `.env.example` 和本小节。

---

## 7. API 集成关键点（apimart · 全项目最容易踩坑的地方）

> 自 v0.8 起代理换成 apimart（`api.apimart.ai`），从同步多端点 → 异步单端点。之前 unifyllm 时代的 quirks（model 名 `mix/`、b64_json data URL、multipart 多 image）**已全部作废**，不要按旧记忆调试。

### 两个端点 + 异步任务模型

```
POST /v1/uploads/images  (multipart, v0.9 起)
→ { url: "https://upload.apimart.ai/...", bytes, content_type, ... }
  url 72h 有效

POST /v1/images/generations  (JSON)
  ├─ 文生图：仅 prompt + size
  └─ 图生图：附加 image_urls 数组，元素 {"url": "<上面拿到的链接>"}
→ { code: 200, data: [{ status: "submitted", task_id }] }

GET /v1/tasks/{task_id}
→ status: submitted | processing | completed | failed
  completed 时：data.result.images[0].url[0] 是稳定 R2 链接
```

固定 `model: "gpt-image-2"`（不要再加 `mix/` 前缀，那是 unifyllm 时代的）。`n` 只接受 1。

### 端到端编排在 `proxy.py`

五个函数：
- `upload_reference_to_apimart(bytes, mime)` → `url`（v0.9 起；multipart POST 到 `/v1/uploads/images`，返回 72h 有效链接）
- `submit_image_task(prompt, size, image_urls=[])` → `task_id`
- `poll_task_until_done(task_id)` → URL 列表（按 12s 初始 + 4s 间隔，超 240s 抛 timeout）
- `download_image(url)` → `(bytes, mime)`
- `run_image_generation(...)` 把 submit → poll → download 串起来；参考图上传发生在更上游的 `jobs.py`（并发 gather），不在这一层

jobs 层只调 `run_image_generation` + `upload_reference_to_apimart`。轮询时长由 `apimart_poll_*` 三个 Settings 字段控制。

### 参考图：走 apimart 自家上传端点（v0.9 起）

apimart 文档原本说 `image_urls` 支持「公网链接」或「base64 data URI」，但 v0.9 时（2026-05-14）他们上线了专用上传端点 `/v1/uploads/images` 并标注 "不再支持在生成接口中直接传入 base64 图片数据"。我们因此抛弃 base64 内联。

流程：用户 POST `/api/uploads` → 文件落本地磁盘 + `files` 表（不动）；jobs 实际跑 edit 时把本地参考图字节并发上传到 apimart 拿 url 列表，再传给 `submit_image_task`。

- 单图上限 **10MB**（`uploads.py · _MAX_UPLOAD_BYTES`）。apimart 端 20MB，10MB 留余量给 LAN 网络。v0.8 那条 "base64 让内存峰值 4×→ 限 5MB" 的限制随之失效
- 上限 5 张（`routers/generations.py · _MAX_REFERENCE_IMAGES`）。apimart 支持 16，但本期保持 5
- 本地副本不删：历史复用、缩略图、7 天 GC 都依赖；apimart URL 只是中转
- 不预上传：用户 POST `/api/uploads` 时不去 apimart，只本地落盘；用户可能上传完不提交（无效成本）。改在 jobs 实际生成时按需上传

### 尺寸（v0.8 起：比例 + 清晰度档位）

apimart 把"画面比例"和"像素清晰度"做成两个正交字段：

- `size` 传比例字符串（`1:1` / `16:9` / `9:16` 等 15 档之一），或 `auto`（仅图生图，让上游按参考图自适应）
- `resolution` 传 `1k` / `2k` / `4k`，决定实际像素与计费档位

> v0.8 早期短暂尝试过把 size 传像素值（如 `2048x2048`），上游也接受。但传像素时 resolution 无法独立切换 —— 想给用户 1K/2K/4K 选择，必须走"比例 + 档位"。这才是本期采用比例的根因。

我们暴露 **7 档场景化比例 + edit 端 auto**，与 apimart 15 档的子集对齐（剩余的 5:4 / 4:5 / 2:1 / 1:2 / 3:1 / 1:3 / 21:9 / 9:21 用户使用频率极低，省略）：

| 比例 | 场景名 |
|---|---|
| 1:1 | 方图 |
| 4:3 | 横向 PPT |
| 3:4 | 小红书 |
| 16:9 | 宽屏 |
| 9:16 | 海报 |
| 3:2 | 摄影 |
| 2:3 | 杂志 |
| auto | 跟随参考图（仅 edit） |

UI 卡片设计：ratio-box（按真实比例画的小白方块）+ 主名（场景）+ 副名（"3:4" 这种比例）。`auto` 档时下方"清晰度"段控件灰掉（输出像素跟随参考图，resolution 不参与上游计算 —— 但仍持久化用户选择，以保留复用时的语义一致）。

**白名单一份在前端 `frontend/src/features/generation/size-presets.ts`，一份在后端 `backend/app/routers/generations.py · _VALID_SIZES` / `_VALID_RESOLUTIONS`。改档位务必两边同步。**

**DB schema**：`generations.params` 是 JSON blob，v0.8 起结构为 `{size: "1:1", resolution: "1k"}`。老历史可能：
- v0.7：`{size: "2048x2048", quality: "high", n: 1}` —— size 是像素字符串
- v0.6 之前：迁移 `c2d3e4f56789` 把 `square` / `landscape` 等枚举映射成像素
- v0.8 极短暂存在的"只有 size 无 resolution"过渡态

Pydantic `GenerationParamsOut` 把 `resolution` / `quality` / `n` 三个字段都 Optional，所有遗留数据都能解析；前端 `parseSize` / `sizeDisplayName` 同时识别比例与像素字符串，老卡片不会渲染异常。

### 不传的参数

- `quality` — apimart 不接受。v0.8 起 UI 删除
- `n` — apimart 只接受 1，UI 已固定为 1
- `official_fallback` — 文档默认 false，本期不暴露
- `mask` / `input_fidelity` / `background` 等 — 同 v0.7 时代结论：不暴露

### 错误分类

```ts
type ErrorCode =
  | 'invalid_domain'    // 留作未来邮箱校验用
  | 'unauthenticated'
  | 'content_policy'    // apimart 审核拦截
  | 'rate_limited'      // 429
  | 'payment_required'  // 402 — apimart 账户余额不足
  | 'upstream_error'    // 5xx
  | 'timeout'           // 任务 240s 未完成 / HTTP 504
  | 'invalid_input'
  | 'not_found'
  | 'forbidden'
  | 'unknown'
```

前端按 code 映射本地化文案，**不暴露 upstream 原始错误给用户**。

### 超时与重试

- 单 HTTP 请求超时 60s（异步 API 每次请求很快，180s 是旧 unifyllm 时代的同步等待）
- 任务总轮询上限 240s（提交 + 12s 等待 + 4s 间隔轮询）
- 429 / 5xx / 网络抖动：最多 4 次（1+2+4=7s 退避），timeout 最多 2 次
- 仍失败 → 标记 job `failed`，写入 `error_code` + `error_message`

---

## 8. Known Quirks & Architecture Decisions

| 决策 | 原因 |
|---|---|
| 异步 job 模型走 DB 轮询（前端 1s 间隔，最多 180s） | Phase 1 规模用不上 Redis / 队列；FastAPI BackgroundTasks 足够 |
| 前端永不直连代理 API | API Key 保护 + 审计需求 |
| 图片走 `/api/files/{id}` 鉴权端点 | 严格校验 `file.user_id == current_user.id`（或 admin） |
| Admin 权限走环境变量 `ADMIN_WORK_IDS` | 不在 DB 维护角色表，Phase 1 够用 |
| 参考图保留 7 天 / 输出软删 30 天 | 见 PRD §4.6；不要改逻辑前不加钩子 |
| 历史按 user_id 强隔离 | 无共享机制，无需权限系统 |
| 后端绑 127.0.0.1，前端绑 0.0.0.0:5173 | 后端不直接暴露 LAN，由 Vite dev proxy 转发 `/api` |
| 工号无密码 + 30 天 cookie | 见 §2 注；首次输入工号自动建账号 |
| v0.8 起代理换 apimart，**异步任务模型**（提交 → 轮询 → 下载）替代 unifyllm 的同步多端点 | 旧供应商 quirks（model 名 `mix/`、b64_json data URL、multipart 多 image、`call_generate`/`call_edit` 双分支）已作废。`proxy.py` 重写为 `submit_image_task` / `poll_task_until_done` / `download_image` / `run_image_generation` 四件套；轮询节奏 12s 初始 + 4s/次 + 240s 上限。详见 §7 |
| 尺寸自 v0.8 改为 **比例字符串（'1:1' 等）+ resolution 档位（1k/2k/4k）** | apimart `size + resolution` 是两个正交字段；传比例时 resolution 才能独立切换、用户才有"清晰度"控件。v0.8 早期短暂走过"size=像素"路径但用户提出要 1K/2K/4K，遂改回比例。前端 7 档场景化比例 + edit auto；UI 卡片显示场景主名 + 比例副名。`params` JSON 现 `{size, resolution}`；老历史的像素 size / 缺 resolution 由 schema Optional 与前端 parseSize 双兼容 |
| 参考图传输 v0.8 改为 **base64 data URI** ~~（multipart 流式 → JSON 内联）~~ → **v0.9 已替代** | v0.8 当时 apimart 没有上传端点，`image_urls` 只接受公网链接或 base64 data URI，我们后端绑 127.0.0.1 没公网入口，只能 base64。代价：内存峰值约 4×原图，所以单图上限从 50MB 压到 5MB。v0.9 起 apimart 上线 `/v1/uploads/images` 专用上传端点并标注 base64 路径要弃用 — 详见下一行 |
| 参考图传输 v0.9 起改 **走 apimart `/v1/uploads/images` 专用上传端点**（base64 → multipart URL） | apimart 上线了 multipart 上传端点（返回 72h 稳定 URL），并在生成接口加 `<Warning>` 标注"不再支持直接传入 base64"。我们顺势切走：避开上游计划下线的路径，同时消除 base64 +33% / 4× 内存峰值的代价。`proxy.py` 新增 `upload_reference_to_apimart`；`jobs.py` 在 edit 路径用 `asyncio.gather` 并发上传 5 张参考图。本地参考图副本仍保留（历史复用 / 缩略图 / 7 天 GC 都依赖）。单图上限随之从 5MB 提到 10MB（apimart 端 20MB，留余量给 LAN） |
| quality / batch n 字段废弃（v0.8） | apimart 不接受 `quality`，`n` 只支持 1。UI 删除两个选择器；老历史的 `params.quality` / `params.n` 仍在 DB（JSON blob），Pydantic schema 用 Optional 兼容读取 |
| 后端 datetime 序列化强制 UTC ISO（带 `+00:00`） | SQLite `DateTime(timezone=True)` 在 SQLite 上 round-trip 会丢 tz；JS `new Date()` 把 naive ISO 当本地时区解析 → 8 小时偏移 → 客户端瞬间超时。修在 `schemas.py · field_serializer` |
| 编辑端支持 1–5 张参考图（v0.8 起 `image_urls` JSON 数组；之前是 multipart 同字段名重复） | schema 用 `generations.reference_file_ids` JSON 数组（迁移 `b1c2d3e4f567`）。apimart 支持 16 张，本期保持 5；提到上限是另一个独立需求 |
| 尺寸从 3 档枚举（square/landscape/portrait）改为 7 档场景化预设 + edit auto，DB 存真实 `WIDTHxHEIGHT` | 旧代理商 2026-04-28 确认上游接受任何满足官方约束的 WxH；apimart v0.8 实测也接受像素 size。前端 UI 走"按场景选"，DB 存真实像素，前端缩略图用 `style.aspectRatio` 直接渲染 — 任意 W×H 都对，不再受 Tailwind JIT 静态类名约束。详见 §7 表与 size-presets.ts；迁移 `c2d3e4f56789` 按 action 把旧枚举映射成像素值 |
| 参考图上传与生成提交解耦：选完图立即 `POST /api/uploads` 拿 `file_id`，提交 `/api/generations` 时只带 `reference_file_ids` | 旧的"提交时一并 multipart 上传"在大图下没有可见进度（fetch 无 upload-progress 事件），用户等待时不知道发生了什么。拆开后每张缩略图独立显示进度 / 成功 / 失败 / 重试，与微信/Notion/ChatGPT 一致。前端用 XHR 监听 `upload.progress`（见 `lib/api.ts · apiUpload`）。orphan upload 由现有 7 天 GC 兜底，不加 DELETE 端点 |

---

## 9. Working with Han

- **不在 PRD 之外自行扩展功能**。哪怕觉得"这个很容易加"。不确定时问。
- **回答先给结论，再给理由**。不要铺垫。
- **PRD 与 API 实际行为冲突立即停下反馈**，不要自行解决。
- **实现完一个里程碑就停下等 review**，不要并行推进多个。
- 代码风格问题先看 PRD §5；仍不确定，截图 + 问题发过来。
- Han 是中文沟通，英文可接受。代码注释中英皆可，提交信息建议英文。
- Han 用 Mac；所有脚本与命令默认在 macOS + zsh 环境测试过。

---

## 10. Definition of Done（每个里程碑共同要求）

除 PRD §8 业务验收外，每个里程碑要满足：

- [ ] 关键路径手工跑通 + 截图 / 命令记录
- [ ] 后端关键路径有 pytest 覆盖（M1 起）
- [ ] 新增环境变量同步写进 `.env.example` + §6
- [ ] TypeScript 无错误，Python 无 type warning
- [ ] 关键架构决策写回 §8
- [ ] PR 描述说明 UI 变更（截图）

---

## 11. Out of Scope 名单（Phase 1 不做，不要"顺便加上"）

照搬 PRD §1.3：

- Prompt 模板、推荐、LLM 改写
- 多模型路由
- 素材库、DAM、品牌资产
- 团队空间、协作、审批流
- 钉钉 SSO、邮箱 magic link、密码（Phase 2 才做）
- 阿里云 OSS / 对象存储（Phase 2）
- Postgres / 容器化（Phase 2）
- 批量任务、队列、计划任务
- 配额、预算管控、按部门限流
- 蒙版局部重绘、高保真参数（`mask` / `input_fidelity` — 代理 silent ignore 不可证。多图参考已于 v0.5.0 解除）
- 透明背景、自定义输出格式
- PWA、移动端 App
- 深色模式
- 国际化（只做中文）
- 管理员在 UI 里改用户权限
- 生成历史分享 / 公开链接

遇到"顺便加一下 X"的冲动，先来这里查；在列表里就别加。

---

## 12. Push & Changelog SOP（每次 Han 说"push"时默认按这套来）

Han 不希望每次 push 都重复说要写 changelog / 版本号 / 拆 commit。这一节把流程固化下来；除非 Han 明确改要求，否则按这执行。

### 1) 决定版本号
基于 `v0.1.0`（2026-04-23）起的 [semver](https://semver.org/lang/zh-CN/) — Phase 1 全程在 `0.x`：
- `minor` (`0.X.0`)：新功能 / 大重构 / 契约变更（DB schema、API 字段、UI 信息架构）
- `patch` (`0.x.Y`)：体验打磨、bug 修复、视觉调整、小重构（无契约变更）
- 不确定走哪边时，默认 patch；只在涉及外部可见契约时升 minor

### 2) 改动前必跑（按改动面分级 — 没 CI，本地是唯一防线）

| 改动面 | 必跑 |
|---|---|
| 仅 `.md` / 注释 / `docs/` | 都不用跑 |
| 仅 `frontend/` | `pnpm typecheck` + `pnpm build`（build 比 typecheck 多 catch Tailwind JIT 扫不到的动态类名、prod-only import / CSS 错配） |
| 仅 `backend/` | `uv run pytest` |
| 跨端 / 契约（schema、API 字段、wire format） | 三个全跑 |
| 含 alembic 迁移 | 加跑 `uv run alembic upgrade head` 在本地 DB 验过 |

lint 不是必跑：`main` 上既有 2 条 `react-hooks/set-state-in-effect` 遗留错误，不强求清零，只看是否**新增**。dev server 视觉验证：UI 改动建议但不强制（无法启动 LAN dev）。

### 3) 写 README changelog 段（在已有最新版本之上插入）
仿现有 `v0.6.x` 段落的格式：
```md
### v<新版本号> — YYYY-MM-DD · <一句概括>

- **动机**：为什么现在要做（用户反馈 / 不合理 / 上游变化）
- **改动点**（按层组织：DB / 后端 / 前端 / UI）
- **取舍**：被 deferred 的、注释里写不下的产品判断

（commit SHA 在 push 后回填到这里，可选）
```
长度参照同类型条目：feat/重构 ~10–20 行；patch/视觉调整 ~5–10 行。

### 4) 同步 CLAUDE.md
- §7（API 集成）：代理契约相关变化必更
- §8（Known Quirks）：新决策 + 一句"为什么"加一行；已失效的旧行**改写不删除**（保留历史脉络）
- 新增 env / 命令 → §3 / §6
- §11（Out of Scope）：只在 Han 显式解除 / 新增某项时改

### 5) commit（默认一个 commit）

**默认合并**：主改动 + README + CLAUDE.md 同步**写在同一个 commit 里**。理由：单仓库 + 直接推 main + 没 PR 流程，"一个版本 = 一个 commit"`git log --oneline` 一行就能看完整个版本干啥；revert/cherry-pick 灵活性这套节奏用不上。

**何时拆开**：一次 push 涉及**两个语义独立的改动**（如同时上 v0.7.x 的设置面板优化 + 一个无关的 admin 页面 fix），按改动语义拆，不按"代码 vs 文档"拆。

**Commit message 格式** — 中文 conventional commits（参考 git history）：

```
<type>(<scope>): <一句话标题>

<动机：为什么现在做>

<改动点：按层组织，DB / 后端 / 前端 / UI / 文档>

<取舍：被 defer 的、注释里写不下的判断>

Docs: README v<版本号> + CLAUDE.md §<相关小节>

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
```

`type`：`feat` 新功能 / `fix` 缺陷或不合理体验 / `refactor` 结构调整无契约变化 / `docs` 纯文档 / `perf` 性能 / `chore` 构建/依赖。

`scope` 选择优先级：**代码所在层 > 业务模块 > 文件名缩写**。常用：`size` / `spotlight` / `history` / `admin` / `auth` / `proxy` / `edit` / `gen` / `layout` / `storage`。

### 6) Stage & 推送
- 用具名 `git add <file1> <file2> …` 一条一条 add；**禁用 `git add .` / `git add -A`**（避免误带 untracked 的 docs/iteration plan / 临时文件 / 凭证）
- 不要 `--no-verify`、不要 `--amend`（即便 hook 失败：fix → 新 commit）
- `git push origin main`，**不 force-push 到 main**

### 7) Push 后
- `git log --oneline -5` 验证 commit 已到 origin
- 跟 Han 报告：版本号、commit hash、推送结果

---

*文档版本：v0.3 · 2026-04-23（同步 PRD-PosterForge-v0.3.md）；§12 Push SOP 自 v0.7.1 起生效*
