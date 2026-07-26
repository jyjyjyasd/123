# PROJECT_MAP.md

> 本文件是 PosterForge 项目的**宏观地图**。目标是让未来的开发者或 AI Agent 能根据任务类型快速找到应该进入哪个目录、阅读哪些关键文件。
> **本文件不列举每个文件**（文件会变），而是描述目录职责和导航规则（目录职责很少变）。
>
> 最后更新：2026-06-25

---

## 1. 项目概要

**Poster Forge** — 内部海报生成 Web 应用。双模式：「快速生成」（单步出图）+「AI 设计助理」（多轮对话引导出图）。

```
单仓库结构：
  frontend/        React 18 + TypeScript + Tailwind + shadcn/ui  (Vite 5, pnpm)
  backend/         Python 3.12 + FastAPI + SQLAlchemy 2.0 async  (uv)
  ├─ app/          应用代码
  ├─ alembic/      数据库迁移
  ├─ tests/        pytest
  └─ data/         运行时数据 (gitignore)
```

核心文档层级（Agent 进入项目后必须先读）：
1. `AGENTS.md` — 协作规范、技术约束、命名约定
2. `PROJECT_MAP.md` — 本文件，导航
3. `PRD.md`（位于 `ai执行规则/当前项目/项目记录/交接；prd；开发文档/`）— v0.4 功能规格

---

## 2. 目录导航

### 2.1 后端 `backend/app/` — 按职责找

```
backend/app/
├── main.py              ← FastAPI 入口，router 注册，全局异常处理
├── config.py            ← 所有环境变量/配置项（Settings 类）
├── db.py                ← 数据库引擎、session factory
├── models.py            ← ORM 模型：User / Generation / File / AgentSession
├── schemas.py           ← Pydantic 请求/响应模型
├── errors.py            ← 错误码定义 + AppError 异常
├── auth.py              ← Cookie session + current_user 依赖注入
├── proxy.py             ← apimart 图像 API 调用（核心，高风险）
├── storage.py           ← 本地文件读写 + files 表记录
├── jobs.py              ← BackgroundTasks：把 proxy + storage 串成生成任务
├── routers/             ← API 路由（每个 router 对应一组端点）
│   ├── auth.py          ← /api/auth/*
│   ├── generations.py   ← /api/generations/* (快速生成 + 历史)
│   ├── uploads.py       ← /api/uploads/*
│   ├── files.py         ← /api/files/* (鉴权文件访问)
│   ├── agent_sessions.py← /api/agent/sessions/* (Agent 模式全部端点)
│   ├── admin.py         ← /api/admin/*
│   └── health.py        ← /api/health
└── agent/               ← Agent 模式核心引擎
    ├── skill_runner.py  ← 状态机：init→clarifying→prompting→generating→done
    ├── llm_client.py    ← LLM 调用 + System Prompt 构建
    ├── info_grouper.py  ← 用户输入 → 结构化信息分类
    ├── layout_processor.py ← 排版意图解析
    ├── prompt_compiler.py  ← 编译最终生图 Prompt（纯函数）
    └── pdf_helper.py    ← PDF 文本提取 + 首页转图
```

**导航规则**：

| 你要做什么 | 进入目录/文件 |
|---|---|
| 新增/修改 API 端点 | `routers/` → 找对应 router 文件 |
| 修改数据库结构 | `models.py` → `alembic/` 写迁移 → `schemas.py` |
| 改配置项 | `config.py` → 同步 `.env.example` |
| 改 Agent 对话流程 | `agent/skill_runner.py`（状态机）+ `agent/llm_client.py`（Prompt） |
| 改图片生成对接 | `proxy.py`（API 契约）+ `jobs.py`（编排） |
| 改认证/权限 | `auth.py` + `routers/auth.py` |
| 查错误码 | `errors.py` |

### 2.2 前端 `frontend/src/` — 按业务找

```
frontend/src/
├── main.tsx              ← React 入口
├── App.tsx               ← 路由定义（查看这个就知道有哪些页面）
├── index.css             ← 全局样式
├── pages/                ← 页面级组件
│   ├── login.tsx
│   ├── workspace.tsx     ← 工作台（快速生成 + Agent 切换）
│   ├── admin.tsx
│   └── generation-detail.tsx
├── features/             ← 按业务域分组的 feature 模块
│   ├── auth/             ← 登录/权限
│   │   ├── api.ts / hooks.ts / RequireAuth.tsx
│   ├── generation/       ← 快速生成模式
│   │   ├── api.ts / hooks.ts / size-presets.ts / error-copy.ts
│   │   └── components/   ← SpotlightBar, ParamsRow ...
│   ├── agent/            ← AI 设计助理模式 (最复杂)
│   │   ├── api.ts / hooks.ts / types.ts / section-parser.ts
│   │   └── components/   ← AgentWorkspace(核心), ChatBubble, ConfirmCard, CanvasArea, ExtendModal ...
│   ├── history/          ← 历史画廊
│   │   ├── hooks.ts / format.ts
│   │   └── components/   ← HistoryDrawer, HistoryCard ...
│   └── admin/            ← 管理员面板
│       ├── api.ts / hooks.ts
│       └── components/   ← AdminGallery, StorageCard ...
├── components/           ← 跨业务通用组件
│   ├── ui/               ← shadcn 原子组件 (button, input, ImageViewer ...)
│   └── layout/           ← 布局壳 (app-layout, top-nav, brand-mark)
└── lib/                  ← 基础设施
    ├── api.ts            ← fetch 封装 (api + apiUpload)
    ├── query-client.ts   ← TanStack Query 配置
    └── utils.ts          ← cn() 等工具函数
```

**导航规则**：

| 你要做什么 | 进入目录/文件 |
|---|---|
| 新增页面 | `pages/` + `App.tsx` 加路由 |
| 改快速生成 UI | `features/generation/` |
| 改 Agent 对话 UI | `features/agent/`（核心是 `AgentWorkspace.tsx`） |
| 改历史画廊 | `features/history/` |
| 改通用组件/布局 | `components/` |
| 改 API 调用封装 | `lib/api.ts` |
| 改类型定义 | 在对应 `features/*/types.ts` 或 `features/*/api.ts` |
| 改路由 | `App.tsx` |

---

## 3. 关键数据流

```
用户操作 → API 端点（routers/）
           ├─ Agent 模式 → agent/skill_runner.py（状态机）
           │               → agent/llm_client.py（LLM 对话）
           │               → agent/prompt_compiler.py（编译 Prompt）
           │               ↓
           └─ 出图请求 → jobs.py（BackgroundTasks）
                         → proxy.py（apimart API）
                         → storage.py（本地落盘）
                         → models.py（写 DB）

前端数据流（Agent 模式最复杂）：
  hooks.ts (SSE 流) → AgentWorkspace.tsx (编排)
    ├─ ChatBubble.tsx (对话气泡)
    ├─ ConfirmCard.tsx (确认卡片)
    └─ CanvasArea.tsx (画布区)
```

Agent 状态机流转（`skill_runner.py`）：
```
init → clarifying → prompting → review_prompt → generating → review → done
                                                              ↓
                                                            failed
```

---

## 4. 高风险的区域

以下文件/目录改动需格外谨慎，建议改动前先阅读源码并和项目负责人确认：

| 区域 | 为什么高风险 |
|---|---|
| `backend/app/proxy.py` | apimart 对接，异步任务模型（submit→poll→download）。旧供应商 quirks 已全部作废，不要凭旧知识改动 |
| `backend/app/schemas.py` datetime 序列化 | 修过 SQLite 时区偏移 bug，删掉会导致 8 小时偏移 |
| `backend/app/errors.py` | 错误码全局共用，改一个影响前端所有错误显示 |
| `backend/app/db.py` | 数据库连接配置（WAL + async），改错会导致数据丢失 |
| `frontend/src/features/agent/section-parser.ts` | `[[SECTION:xxx]]` 是 Agent 流式消息协议，改动会破坏整个对话渲染 |
| `frontend/src/lib/api.ts` `apiUpload` | XHR 上传进度，换成 fetch 会丢失进度回调 |
| `backend/alembic/versions/*` | 已执行的迁移不可逆向修改 |
| 尺寸比例白名单 | `size-presets.ts`（前端）和 `_VALID_SIZES`（后端）必须同步改动 |

---

## 5. 工程约定速查

详见 `AGENTS.md`，这里列出最常被触发的事项：

- **UI 规范**：主按钮深色 `bg-[#37352F]`，圆角按层级（6/8/12/16px），不用 `shadow-lg`+，字体加粗上限 600
- **尺寸修改**：前后端白名单必须同步（`size-presets.ts` ↔ `generations.py` `_VALID_SIZES`）
- **Agent LLM 配置**：`config.py` 有独立的 `agent_llm_*` 字段，默认 fallback 到 apimart key
- **改代码前必跑**：仅前端→`pnpm typecheck && pnpm build`；仅后端→`uv run pytest`；跨端→全跑
- **Out of Scope**：AGENTS.md §11 列出的功能不要碰（SSO、OSS、Postgres、深色模式、国际化等）

---

## 6. 本文件使用指南

**本文件的设计意图**：提供目录级导航，不是文件级索引。Agent 应该：

1. 根据任务类型，在上面的表格中找到对应目录
2. 进入目录后，通过文件名和源码自行确认具体逻辑
3. 不确定时，优先 `search_files` 搜索关键字定位

**更新原则**：只在目录结构发生重大变化时更新本文件（如新增/删除模块目录、核心文件重命名）。不随单个文件的增删而更新。


