# Poster Forge · PRD v0.3

> **Poster Forge** 是一个供公司全体同事自助生成视觉物料的内部 Web 应用。
>
> **文档读者**：Claude Code（作为开发执行者）
>
> **指导原则**：Phase 1 以"能在 Han 的 Mac 上跑、能通过公司 LAN 发给同事测试"为第一目标。Phase 2 的生产级部署（Docker / SSO / HTTPS / 对象存储）**全部 deferred**。

> **v0.3 变更**：产品命名为 Poster Forge；技术栈切换为 Vite + FastAPI + SQLite + 本地磁盘；认证简化为邮箱域名校验；加入 Phase 1 / Phase 2 分层；移除钉钉 SSO、Docker、OSS 等 Phase 1 无关的决策项。

---

## 1. 背景与非目标

### 1.1 为什么做
- 2026-04-21 OpenAI 发布 gpt-image-2，海报 / banner / 社交图等常见视觉物料的生成质量达到可直接使用的水平。
- 公司现状：所有物料需求排队找平面部门；其他部门自己做基本靠模板，效果差。
- 机会：让全公司同事自助产出 70~90 分的视觉物料，释放平面部门产能。

### 1.2 Phase 1 要做
- Web 应用，跑在 Han 的 Mac 上，通过公司 LAN 发给同事访问
- 两个核心动作：**图像生成**、**图像编辑**
- 单模型：`gpt-image-2`（编辑走 `mix/gpt-image-2`）
- 个人历史记录（可回看、可复用 prompt）
- 轻量认证：公司邮箱域名校验

### 1.3 Phase 1 不做（全部 deferred 到 Phase 2 或更后）
- Docker 化部署、容器编排
- 内网域名 / HTTPS / 证书
- 钉钉 SSO、邮箱 magic link（发真实邮件）、密码
- 阿里云 OSS 或其他对象存储
- 生产级数据库（Postgres）
- prompt 模板 / 推荐 / LLM 改写
- 品牌一致性、协作、共享、审批
- 素材库、DAM 集成
- 多模型、队列、批量任务
- 配额、预算管控、用量报表
- 蒙版局部重绘、多图参考、高保真参数（M3 做 API 能力验证，支持则补）
- 透明背景、自定义输出格式 / 压缩率
- 深色模式、国际化、移动端 App

---

## 2. 用户与场景

### 2.1 目标用户
公司全体员工，跨部门，技能混合：

| 画像 | 占比预估 | 关键诉求 |
|---|---|---|
| 无设计背景（市场、销售、产品、运营等） | 多数 | 把想法"画出来"且可用 |
| 有设计基础（平面部门、POP 内容团队等） | 少数 | 快速出 idea / 对比方案 |

### 2.2 场景示例
- 市场同事出一张公众号头图
- 销售出一张产品宣传图发客户群
- 产品出一张功能发布 banner
- 品牌出节日海报初稿供平面部门精修

### 2.3 量级
- 初期约 **100 张/天**
- 活动日峰值可能 50+ 张/小时

---

## 3. 功能规格

### 3.1 两个核心动作

| 动作 | 输入 | Endpoint | Content-Type |
|---|---|---|---|
| **生成** | 文字 prompt | `POST /v1/images/generations` | `application/json` |
| **编辑** | 文字 prompt + 1 张参考图 | `POST /v1/images/edits` | `multipart/form-data` |

### 3.2 输入形态

**生成：** Prompt 多行文本，前端限 8000 字符。

**编辑：**
- Prompt 多行文本
- 参考图：Phase 1 限 1 张；格式 png/jpg/webp；单张 ≤ 50MB
- *(多图、蒙版、高保真：M3 做 API 能力验证后决定)*

### 3.3 参数面板（Phase 1 仅暴露代理 API 文档已确认的参数）

| 参数 | 生成可选值 | 编辑可选值 | 默认 | 说明 |
|---|---|---|---|---|
| **尺寸** | 方形 `1024×1024` / 横版 `1792×1024` / 竖版 `1024×1792` | 方形 `1024×1024` / 横版 `1536×1024` / 竖版 `1024×1536` | 方形 | 两端比例不同是 API 限制；UI 按"方形/横版/竖版"三选，内部按模式映射 |
| **质量** | low / medium / high / auto | 同上（文档未列，但发送；若不兼容再退） | **high** | 代理文档生成侧默认 low，我们给 high（物料场景优先） |
| **张数** | 1 / 2 / 4 | 1 / 2 / 4 | 1 | 代理支持到 10，UI 封顶 4 控成本 |

**不暴露给用户、后端硬编码或不发送的参数：**
- 生成请求中 `user` 字段统一传 `user_id`（便于代理侧溯源）
- 其余未在文档中的参数一律不发送

### 3.4 历史记录（个人）

每条记录：
- 缩略图（首图）+ 全部产出图（1~4 张）
- Prompt 原文 + revised_prompt（如 API 返回）
- 动作类型 · 参数快照 · 参考图（编辑模式）· 生成时间
- 操作：**复用**（prompt + 参数填回）/ **下载** / **删除**

分页：每页 20 条，无限滚动。

### 3.5 主路径

```
填 prompt + (可选) 上传参考图 + 选参数
  ↓ 点"生成"
前端 POST /api/generations → 后端即时返回 job_id
  ↓
前端轮询 GET /api/generations/{job_id} (1s 间隔，最多 180s)
  ↓
后端 FastAPI BackgroundTasks 调用代理 API → 下载/解码 → 写本地磁盘 → 更新 DB
  ↓
前端 status=completed，渲染图片 + 下载按钮
```

---

## 4. 技术规格（Phase 1）

### 4.1 技术栈

| 层 | 选型 | 说明 |
|---|---|---|
| **前端** | Vite 5 + React 18 + TypeScript + Tailwind + shadcn/ui + TanStack Query + React Router | 纯 SPA，无 SSR |
| **后端** | Python 3.12 + FastAPI + SQLAlchemy 2.0 (async) + Alembic + httpx + Pillow | 单进程 |
| **数据库** | SQLite · `backend/data/posterforge.db` | WAL 模式 |
| **存储** | 本地磁盘 · `backend/data/uploads/` + `backend/data/outputs/` | 通过 `/api/files/{id}` 鉴权端点返回 |
| **认证** | 邮箱域名校验 + session cookie | 不发邮件、不入库验证 |
| **运行** | Mac 本机双进程 · Vite 5173 对 LAN + Uvicorn 8000 只绑 127.0.0.1 · Vite dev proxy 转发 `/api` | |
| **仓库** | 单仓库 `frontend/` + `backend/` | |
| **包管理** | 前端 pnpm · 后端 uv | |

### 4.2 架构原则
1. **前端走相对路径 `/api/*`**，由 Vite dev proxy 转发给后端；前端代码里不写后端 IP
2. **后端只绑 127.0.0.1**，不直接暴露给 LAN；只有 5173 对外
3. API Key 只在后端 `.env`，前端永不接触
4. 图片经后端中转到本地磁盘，前端拿到的是 `/api/files/{id}` URL
5. 异步 job 模型走数据库轮询（FastAPI BackgroundTasks），不引 Redis

### 4.3 Data model

```sql
CREATE TABLE users (
    id              TEXT PRIMARY KEY,           -- UUID str
    email           TEXT UNIQUE NOT NULL,
    name            TEXT,                       -- 默认 email local part，可后续修改
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login_at   TIMESTAMP
);

CREATE TABLE generations (
    id                TEXT PRIMARY KEY,
    user_id           TEXT NOT NULL REFERENCES users(id),
    action            TEXT NOT NULL,            -- 'generate' | 'edit'
    status            TEXT NOT NULL,            -- 'pending' | 'running' | 'completed' | 'failed'
    prompt            TEXT NOT NULL,
    params            TEXT NOT NULL,            -- JSON: {size, quality, n}
    reference_file_id TEXT,                     -- FK to files.id (仅 edit)
    output_file_ids   TEXT,                     -- JSON array of files.id
    revised_prompt    TEXT,
    error_code        TEXT,                     -- 'content_policy' | 'rate_limited' | ...
    error_message     TEXT,
    created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at      TIMESTAMP,
    deleted_at        TIMESTAMP
);

CREATE TABLE files (
    id           TEXT PRIMARY KEY,              -- UUID str
    user_id      TEXT NOT NULL REFERENCES users(id),
    kind         TEXT NOT NULL,                 -- 'upload' | 'output'
    path         TEXT NOT NULL,                 -- 相对 backend/data/ 的路径
    mime_type    TEXT NOT NULL,
    size_bytes   INTEGER NOT NULL,
    width        INTEGER,
    height       INTEGER,
    created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at   TIMESTAMP
);

CREATE INDEX idx_gen_user_created ON generations(user_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_gen_status ON generations(status) WHERE status IN ('pending', 'running');
CREATE INDEX idx_files_user ON files(user_id);
```

**说明：** 把文件抽成独立表是为了统一 `/api/files/{id}` 访问 + 权限检查路径；Phase 2 换 OSS 时只需改 `path` 的解析策略。

### 4.4 内部 API 契约

所有业务 API 需登录态 cookie（`session`，HttpOnly + SameSite=Lax）。

#### 认证
```
POST /api/auth/login
Body: { "email": "zhang.san@company.com" }
→ 校验域名；upsert users；种 session cookie；返回 { user: {id, email, name} }
→ 400 if domain mismatch: { error: { code: "invalid_domain", message: "请使用公司邮箱" } }

POST /api/auth/logout
→ 清 cookie；204

GET /api/me
→ { id, email, name } 或 401
```

#### 生成
```
POST /api/generations
Content-Type: multipart/form-data
Fields:
  action: "generate" | "edit"
  prompt: string
  size: "square" | "landscape" | "portrait"
  quality: "low" | "medium" | "high" | "auto"
  n: 1 | 2 | 4
  reference_image: File                # 仅 edit
→ 202: { job_id, status: "pending" }

GET /api/generations/{job_id}
→ 200: Generation 完整记录

DELETE /api/generations/{job_id}
→ 204; 软删（标记 deleted_at）

GET /api/history?cursor={created_at}&page_size=20
→ { items: [...], next_cursor, has_more }
```

#### 文件
```
GET /api/files/{file_id}
→ 检查 file.user_id == 当前用户 id（或 admin）
→ 流式返回文件内容，Content-Type 按 mime_type
→ 404 / 403 不泄露文件是否存在
```

#### 管理员
```
GET /api/admin/stats
→ 仅 ADMIN_EMAILS 白名单用户可访问
→ { today: {total, failed}, month: {total}, top_departments: [...], recent_failures: [...] }
```

### 4.5 代理 API 调用

Base URL 和 Key 放 `backend/.env`：`PROXY_BASE_URL`、`PROXY_API_KEY`。

**生成：**
```python
payload = {
    "model": "gpt-image-2",
    "prompt": prompt,
    "n": n,
    "size": pixel_size,       # "1024x1024" | "1792x1024" | "1024x1792"
    "quality": quality,
    "user": str(user_id),
}
resp = await httpx_client.post(
    f"{PROXY_BASE_URL}/v1/images/generations",
    headers={"Authorization": f"Bearer {PROXY_API_KEY}"},
    json=payload,
    timeout=180,
)
```

**编辑：**
```python
files = {"image": ("ref.png", ref_bytes, "image/png")}
data = {
    "model": "mix/gpt-image-2",           # 注意 mix/ 前缀
    "prompt": prompt,
    "n": str(n),
    "size": pixel_size,                    # "1024x1024" | "1536x1024" | "1024x1536" | "auto"
}
resp = await httpx_client.post(
    f"{PROXY_BASE_URL}/v1/images/edits",
    headers={"Authorization": f"Bearer {PROXY_API_KEY}"},
    files=files,
    data=data,
    timeout=180,
)
```

**尺寸映射：**
```python
SIZE_MAP = {
    "generate": {
        "square":    "1024x1024",
        "landscape": "1792x1024",
        "portrait":  "1024x1792",
    },
    "edit": {
        "square":    "1024x1024",
        "landscape": "1536x1024",
        "portrait":  "1024x1536",
    },
}
```

**响应处理：**
- 响应结构：`{ created, data: [{ url, b64_json, revised_prompt }] }`
- 优先读 `b64_json` 解码写本地磁盘；退化：从 `url` 下载后写本地磁盘
- 存 `revised_prompt` 到 DB

### 4.6 文件存储

```
backend/data/
  posterforge.db
  uploads/{user_id}/{yyyy}/{mm}/{uuid}.{ext}   # 用户上传参考图
  outputs/{user_id}/{yyyy}/{mm}/{uuid}_{i}.{ext}  # 生成结果
```

- 参考图：生成完成 7 天后清理（脚本 / 启动时检查）
- 输出：软删 30 天后物理清理
- 全部通过 `/api/files/{id}` 访问，后端校验 `file.user_id == current_user.id`（或 admin）
- `backend/data/` 整个目录 `.gitignore`，备份 = `cp -r`

### 4.7 错误处理

```python
ErrorCode = Literal[
    "invalid_domain",        # 登录邮箱域名错误
    "unauthenticated",       # 401
    "content_policy",        # 代理审核拦截
    "rate_limited",          # 代理 429
    "upstream_error",        # 代理 5xx
    "timeout",               # 代理超时
    "invalid_input",         # 参数校验失败
    "not_found",
    "forbidden",
    "unknown",
]
```

重试策略：
- 代理 429 → 延迟 2s 重试一次
- 代理 5xx / 超时 → 重试一次
- 依然失败 → job 标记 `failed`，写入 `error_code` + `error_message`

前端按 code 映射本地化文案，不暴露 upstream 原始错误给用户。

---

## 5. 设计系统（Notion 风格）

> 同 v0.2。简要复述 token 原则，详细值见 `docs/design-tokens.md`（将由 M1 阶段生成）。

### 5.1 基调三铁律
1. 不用渐变、不用深色阴影、不用亮色填充大块
2. 层级靠**字重、字号、间距**表达，不靠颜色饱和度
3. Hover 只改背景色，不改位移 / 阴影 / 尺寸

### 5.2 核心色板

```css
/* 表面 */
--bg-primary:    #FFFFFF;
--bg-secondary:  #F7F6F3;
--bg-tertiary:   #EFEEEC;
--bg-hover:      rgba(55, 53, 47, 0.04);
--bg-active:     rgba(55, 53, 47, 0.08);

/* 文字 */
--text-primary:   #37352F;
--text-secondary: #787774;
--text-tertiary:  #9B9A97;
--text-disabled:  #D3D1CB;

/* 边框 */
--border-default: rgba(55, 53, 47, 0.09);
--border-strong:  rgba(55, 53, 47, 0.16);

/* 强调色（极少用，仅链接 / 选中态） */
--accent:         #2383E2;
--accent-hover:   #0F74CE;
--accent-bg:      rgba(35, 131, 226, 0.08);

/* 状态 */
--success: #4DAB9A;  --warning: #CB912F;  --error: #E03E3E;
--error-bg: rgba(224, 62, 62, 0.08);
```

### 5.3 字体
```css
--font-sans: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI",
             "PingFang SC", "Source Han Sans SC", "思源黑体",
             "Microsoft YaHei", system-ui, sans-serif;
```

字号：12 / 13 / 14 (默认) / 16 / 20 / 28 / 40。字重 400 / 500 / 600 三档。

### 5.4 圆角与阴影
- 圆角 3 / 6 / 8 / 12 / 16px 五档，按容器层级递增：图标按钮 6、卡片 8~12、浮层 16
- 阴影主要用于浮层（弹窗、抽屉）；卡片可用浅阴影（`shadow-sm` / `shadow-popover`）做悬停反馈

### 5.5 UI 硬规则（验收项）
- 主按钮**深色不蓝**：`bg-[#37352F] text-white`，padding 6×12，radius 6px
- 不用 `shadow-lg` 及以上
- hover 默认改 `bg`；卡片 / 图标按钮可叠加**轻量**位移与浅阴影做反馈：
  - `translate-y` ≤ 2px、`scale` ≤ 1.05
  - 阴影上限 `shadow-popover`
  - 过渡时长 ≤ 200ms
- 字重上限 `font-semibold`（600）

---

## 6. 页面

### 6.1 `/login`
极简。页面正中偏上：
- Logo + "Poster Forge" 标题（text-xl, weight 600）
- 邮箱输入框（placeholder `"公司邮箱"`）
- 深色"进入"按钮
- 域名错误时在下方显示 `text-error` 文字："请使用公司邮箱"

除此之外什么都没有。

### 6.2 `/` · 工作台

左栏 480px（输入区）+ 右栏自适应（结果区），无硬边框分隔，靠间距。

**顶部导航 48px**：左侧"Poster Forge"，右侧"历史"链接 + 头像（点击下拉"退出"）。

**左栏从上到下**：
- Tab："生成 | 编辑"（下划线选中态）
- Prompt 多行 textarea（默认 4 行高度，自适应）
- 参考图上传（仅编辑 tab）：虚线边框 dropzone，120px 高；上传后显示缩略图 + 移除按钮
- 参数选择器（三个分段控件同行）：
  - 尺寸：三个图形化小矩形图标（方/横/竖），hover 显示像素 tooltip
  - 质量：低 / 中 / **高** / 自动
  - 张数：**1** / 2 / 4
- 深色"生成"主按钮（生成中变 disabled，文案"生成中…"）

**右栏（结果区）**：

| 状态 | 表现 |
|---|---|
| 空 | text-tertiary 居中弱化提示"结果会在这里显示" |
| 生成中 | 按张数显示 N 个 skeleton 方块，下方小字"预计 30~90 秒" |
| 完成 | 1~4 张图网格，每张 hover 显示"下载"按钮 |
| 失败 | 小图标 + 错误文案 + "重试"文字按钮 |

结果图下方 hover 显示快捷操作：
- "再生成一次"（同参数新 job）
- "作为参考图继续编辑"（把该图作参考，切编辑 tab）

### 6.3 `/history`

三列网格（宽屏）/ 单列（窄屏）。每条：缩略图 + prompt 截断 + 时间 + 参数标签。hover 换底色。点击打开右侧 480px 抽屉或居中模态（按屏宽）：大图轮播 / 完整 prompt / revised_prompt / 参数 / 参考图 / "复用"主按钮 + "下载 / 删除"文字按钮。

删除走 inline 二次确认，不弹模态。

### 6.4 `/admin`（仅 `ADMIN_EMAILS` 用户可见）

极简面板：今日总次数 / 本月总次数 / 失败率 / 用户用量 Top 10 / 最近 50 条失败日志。

---

## 7. 非功能需求（Phase 1）

### 7.1 性能
- 首屏 < 2s
- 提交任务 API < 500ms（不等代理）
- 低质小图 < 30s，高质大图 < 120s

### 7.2 日志
- 结构化 JSON 输出到 stdout
- 含 `user_id / job_id / 耗时 / error_code`
- 失败日志完整保留请求参数（prompt 截断 500 字）

### 7.3 安全（Phase 1 口径）
- `PROXY_API_KEY / SESSION_SECRET` 仅在 `backend/.env`
- 所有业务 API 验登录态
- `/api/files/{id}` 严格校验 `file.user_id == current_user.id`（或 admin）
- 上传 MIME 白名单：`image/png`、`image/jpeg`、`image/webp`
- 单文件 ≤ 50MB
- 后端绑 127.0.0.1，不直接暴露给 LAN（仅前端 5173 对 LAN）
- Session cookie：HttpOnly + SameSite=Lax + 30 天有效期

### 7.4 不做的安全项（Phase 1）
- 不做邮箱真实性验证（纯信任 LAN 内用户）
- 不做 CSRF token（SameSite=Lax 够用）
- 不做 HTTPS（HTTP only，LAN 内）
- 不做速率限制（100 张/天，代理侧有限速）

---

## 8. 里程碑

| 阶段 | 交付 | 验证 |
|---|---|---|
| **M0 · 初始化** | Monorepo 脚手架、`start.sh`、`.env.example`、Alembic 初始迁移 | `./start.sh` 能起双进程并打印 LAN URL |
| **M1 · 骨架** | 登录、DB schema、空白工作台页、鉴权中间件 | 用公司邮箱登录进主页，看到自己的名字 |
| **M2 · 生成链路** | 文字生成全链路（后台任务、轮询、文件存储、图片渲染） | 能出图并下载 |
| **M3 · 编辑链路 + API 能力验证** | 单张参考图编辑；**并实测 mask / input_fidelity / 多图是否代理支持**，回传结果给 Han | 能编辑出图；回收 API 能力清单 |
| **M4 · 历史** | 列表、详情抽屉、复用、删除 | 历史闭环 |
| **M5 · 打磨** | Notion 风格全量对齐、错误处理、空状态、管理员面板 | 发给同事试用 |

**M3 小决策点**：API 实测结果决定 `mask / input_fidelity / 多图` 是否并入 UI；不支持则列入 V2 候选。

---

## 9. 待决策项

大部分 v0.2 的决策在 Phase 1 简化后已解决。仅剩：

| # | 决策项 | 我的建议 | 说明 |
|---|---|---|---|
| 1 | 公司邮箱域名 | 你给一个 | `.env` 里 `ALLOWED_EMAIL_DOMAIN` |
| 2 | 代理账号限速 | 你和代理服务商确认 | 100 张/天 + 峰值 50/小时 |
| 3 | 管理员邮箱 | 先只你一个 | `.env` 里 `ADMIN_EMAILS` |
| 4 | 编辑端 `quality` 参数 | 仍然发送 | M3 实测若不兼容再退 |

---

## 10. 验收标准（Phase 1 可发给同事）

- [ ] `./start.sh` 一条命令起双进程，打印 LAN 访问 URL
- [ ] 同事通过 `http://<Mac IP>:5173` 能访问
- [ ] 非公司邮箱登录被拒绝，错误文案友好
- [ ] 工作台输入 prompt 点生成，30~120s 内得到可下载的图
- [ ] 上传 1 张参考图 + prompt，能得到编辑结果
- [ ] 历史页能看到自己过去的全部生成记录
- [ ] 用户 A 看不到用户 B 的历史和文件（`/api/files/{id}` 鉴权验证）
- [ ] 复用按钮能把历史 prompt 和参数一键填回
- [ ] 内容审核触发有友好提示，不暴露原始 API 错误
- [ ] 管理员面板能看到今日总次数
- [ ] 3 个不同部门同事各完成一次完整生成，无需口头指导
- [ ] UI 通体 Notion 风格（主按钮深色不蓝、圆角 ≤ 6px、无重阴影）

---

## 11. Phase 2 · 生产部署路线图（deferred）

Phase 1 跑通 + 试用反馈积极后，再启动 Phase 2。不是承诺，是 "如果继续投入要怎么走" 的备忘：

| 维度 | Phase 1 | Phase 2 |
|---|---|---|
| 运行环境 | Han 的 Mac | 公司内网 Linux 机 |
| 进程管理 | `start.sh` + `caffeinate` | Docker Compose / systemd |
| 访问方式 | `http://<Mac IP>:5173` | `https://posterforge.company.local`（需内网 DNS + 证书） |
| 数据库 | SQLite | Postgres（改 `DATABASE_URL`） |
| 文件存储 | 本地磁盘 | 阿里云 OSS（swap Storage adapter） |
| 认证 | 邮箱域名信任 | 钉钉扫码 SSO（多加一个 auth provider） |
| 备份 | `cp -r data/` | Postgres 备份 + OSS 跨区复制 |
| 监控 | stdout 日志 | 接入公司可观测平台 |

**迁移友好性设计**（Phase 1 已经铺好的路）：
- SQLAlchemy + Alembic → Postgres 切换只改 URL 和跑一次迁移
- 文件访问统一走 `/api/files/{id}`，底层 adapter 可替换
- 认证走标准 session cookie，加 auth provider 不改业务代码
- 前端走 `/api/*` 相对路径，后端换地址只改反向代理配置

---

## 附录 A：API 快速参考

**生成 `POST /v1/images/generations`**（JSON）
```json
{
  "model": "gpt-image-2",
  "prompt": "...",
  "n": 1,
  "size": "1024x1024",
  "quality": "high",
  "user": "<user_id>"
}
```

**编辑 `POST /v1/images/edits`**（multipart/form-data）
```
model:  mix/gpt-image-2
prompt: ...
image:  <binary>
n:      1
size:   1024x1024
```

**响应**
```json
{
  "created": 1714000000,
  "data": [
    { "url": "...", "b64_json": "...", "revised_prompt": "..." }
  ]
}
```

## 附录 B：Prompt 示例（内部培训材料）

- **海报**："A modern minimalist poster for spring fashion sale, pastel pink background, large bold Chinese headline '春日焕新 全场5折', clean sans-serif typography, retail style"
- **Banner**："A horizontal banner for an AI product launch, futuristic dark background with subtle neon accents, headline 'AI 智绘 · 让创意即刻成形' in elegant Chinese font, professional and high-tech"
- **换背景（编辑）**：上传人像，prompt "Replace the background with a soft gradient studio backdrop in warm beige, keep the person exactly the same, preserve facial features and outfit details"
- **加元素（编辑）**：上传产品图，prompt "Add a delicate soft shadow underneath the product and a subtle linen texture to the background, keep the product identical"

---

**文档版本**：v0.3 · 2026-04-23
**变更**：Poster Forge 命名；Vite + FastAPI + SQLite + 本地磁盘栈；邮箱域名认证；Phase 1 / Phase 2 分层。
