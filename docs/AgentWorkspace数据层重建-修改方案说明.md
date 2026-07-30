# AgentWorkspace 数据层重建 — 修改方案说明

> **版本**：v1.0 · 2026-07-29  
> **状态**：待评审  

---

## 一、问题现状

### 1.1 AgentWorkspace.tsx 单体化

`frontend/src/features/agent/components/AgentWorkspace.tsx` 当前 **31,857 行 / 246KB**，内含 18 个 `useState`、14 个 `useEffect`、4 个 `useRef`，全部内联于同一函数组件。

最新 3 次 commit 呈现典型的"打补丁死循环"——每次修复一条同步路径，另一条断裂：

- `5d78226`：修复推荐风格和排版覆盖用户自定义输入
- `57c2fb3`：Revert 以上（引入构建错误）
- `0931bd3`：修复推荐风格被自动填充为英文文本 + 构建错误

### 1.2 多源真理（Multi-Source Truth）

同一个设计方案同时存在于 **7 处**，无统一读写入口，依赖 14 个 `useEffect` 隐式维护：

| 位置 | 类型 |
|---|---|
| LLM 自然语言回复 | 展示文本 |
| `[[SECTION:xxx]]` 区块 | 展示文本中的结构化段落 |
| `[JSON_START]...[JSON_END]` | 隐藏的结构化数据 |
| `session.stream_a` | DB 字段（copy / layout_notes / layout_recommendations） |
| `session.stream_b` | DB 字段（visual_description / style_recommendations） |
| `formData` (React state) | 前端内存（copy / selectedStyle / selectedLayout / aspect_ratio / resolution） |
| `final_prompt` | 编译后的最终生图 Prompt |

**AI 新推荐覆盖用户手动编辑**的根本原因：无脏标记——任一 `useEffect` 均可在 AI 返回新数据时无条件覆写 `formData`。

### 1.3 根因关系

组件单体化是根因，多源同步是症状。因为所有逻辑塞在一个巨型组件内，数据没有明确的所有权边界——任何一个 `useEffect` 都可以改 `formData`，任何一个回调都可以从 `session.stream_a`/`stream_b` 读取数据。

---

## 二、修改目标

| 目标 | 衡量标准 |
|---|---|
| 建立单源真理 | 所有设计数据（文案/风格/排版/尺寸/分辨率）存储在唯一的数据层中 |
| 引入脏标记 | 用户手动编辑过的字段不被 AI 新推荐覆盖 |
| 组件拆分 | AgentWorkspace.tsx ≤ 500 行（当前 31,857 行） |
| 不影响 LLM 行为 | System Prompt 不改，LLM 输出格式不变，生图路径不变 |
| 老会话兼容 | `design_json = null` 的历史会话正常回放 |

---

## 三、整体策略

### 3.1 数据层：后端聚合，不依赖 LLM 输出新格式

当前 LLM 输出格式（自然语言 + `[[SECTION]]` + `[JSON_START]...[JSON_END]`）已在生产环境稳定运行数月。方案**不改变 LLM 的 System Prompt**，而是在后端新增一个聚合步骤：LLM 输出照旧解析为 `stream_a`/`stream_b` 后，由 Python 代码从中提取结构化字段，组装为 `design_json` 存入数据库。

```
LLM 输出（不变）
       ↓
  stream_a / stream_b（不变）
       ↓
  后端聚合代码（新增，~20 行）
       ↓
  design_json（新字段）
       ↓
  前端 DesignStore（新数据层）
```

### 3.2 状态管理：Zustand 替代 14 个 useEffect

当前 7 处数据源通过 14 个 `useEffect` 隐式维护同步关系。方案用 Zustand 外部 store 作为唯一数据层：

```
session（后端数据）
       ↓
  useDesignSync（唯一同步入口）
       ↓
  DesignStore（Zustand 单例，唯一数据源）
       ↓  ┌─→ CopyEditor       （只订阅 copy_raw + dirty_copy）
       ├─→ StyleSelector      （只订阅 style_recommendations + active_style）
       ├─→ LayoutSelector     （只订阅 layout_recommendations + active_layout）
       └─→ ExportPanel        （只订阅 active_ratio + active_resolution）
```

**选型理由**：Zustand 基于 selector 订阅，组件按字段粒度重渲染，避免 React Context 的全局传播问题。不需要 Provider 包裹，与现有组件树零侵入。

### 3.3 阶段分工：Stage 1 保留自然语言，Stage 2 切换到结构化数据

| 阶段 | 数据类型 | 渲染方式 |
|---|---|---|
| 对话（clarifying） | LLM 自然语言 + `[[SECTION]]` | `section-parser.ts` 解析展示（不变） |
| 定稿（prompting） | LLM 自然语言（仍输出） + `design_json`（结构数据） | 编辑区读 DesignStore 渲染，不再解析 `[[SECTION]]` |

对话阶段保留自然语言的理由：追问式交互（"什么活动？""夏日市集"）天然适合自然语言，对话感优先。

---

## 四、具体修改

### Step 1 — 后端：新增 `design_json` 字段 + Alembic 迁移

| 文件 | 操作 |
|---|---|
| `backend/app/models.py` | `AgentSession` 新增 `design_json`（`TEXT nullable`） |
| `backend/alembic/versions/` | 新建迁移文件 |
| `backend/app/schemas.py` | `AgentSessionOut` 新增 `design_json: Optional[dict]` |
| `backend/app/agent/skill_runner.py` | `stream_clarify` 末尾 `db.commit()` 前插入聚合逻辑 |

聚合逻辑（仅当 `status = "prompting"` 时执行）：

- 从 `stream_a` 提取 `copy` → 按 `|` 拆分为 `segments` 数组
- 从 `stream_a` 提取 `layout_recommendations`
- 从 `stream_b` 提取 `visual_description`、`style_recommendations`
- 组装为 `design_json` JSON 字符串写入 DB
- clarifying 阶段 `design_json = null`

**不改动**：`llm_client.py`、`prompt_compiler.py`、`stream_a`/`stream_b` 解析路径。

### Step 2 — 前端：建立 DesignStore（Zustand 单例）

新增文件：`frontend/src/features/agent/design-store.ts`

需安装：`pnpm add zustand`

核心字段：

| 字段 | 类型 | 来源 | 脏标记 |
|---|---|---|---|
| `copy_raw` | `string` | `design_json` | `dirty_copy` |
| `copy_segments` | `array` | `design_json` | — |
| `active_style` | `object \| null` | 用户选择 | `dirty_style` |
| `active_layout` | `object \| null` | 用户选择 | `dirty_layout` |
| `active_ratio` | `string` | `session.aspect_ratio` | — |
| `active_resolution` | `string` | `session.resolution` | — |
| `style_recommendations` | `array` | `design_json` / `stream_b` 兜底 | — |
| `layout_recommendations` | `array` | `design_json` / `stream_a` 兜底 | — |

脏标记规则：用户手动编辑 → `dirty = true`；AI 新数据到达时仅覆写 `dirty = false` 的字段。

### Step 3 — 前端：建立 useDesignSync hook

新增文件：`frontend/src/features/agent/use-design-sync.ts`

监听 `session.status` 和 `session.design_json`。当 `status === "prompting"` 且 `design_json` 非 null 时，将结构化数据注入 `DesignStore`（遵守脏标记）。`design_json = null` 时从 `stream_a`/`stream_b` 兜底馈入。

### Step 4 — 前端：弹窗状态下沉

将 `ExtendModal`、`ResolutionExtendModal`、`StyleTagPopover`、`LayoutTagPopover`、`ConfirmCard` 的 `useState` 移入各自组件内部，AgentWorkspace 只传递 `isOpen`。弹窗内部通过 `useDesignStore` 直接读写所需数据。

### Step 5 — 前端：拆分 ClarifyPanel + StyleSelector + LayoutSelector

- **ClarifyPanel**：对话气泡渲染 + SSE 流式内容消费。对话阶段用 `section-parser.ts`，定稿阶段从 `DesignStore` 读推荐数据渲染卡片。
- **StyleSelector / LayoutSelector**：读 `DesignStore` 显示推荐卡片，用户选择写入 `DesignStore`（带脏标记）。

### Step 6 — 前端：拆分 CopyEditor + ExportPanel

- **CopyEditor**：读 `copy_raw`/`dirty_copy`，支持多段编辑、密度切换、AI 刷新。AI 刷新结果写入时重置 `dirty_copy = false`。
- **ExportPanel**：读 `active_ratio`/`active_resolution`，控制尺寸切换、分辨率选择、生成/延伸触发。

### Step 7 — 前端：清理 formData，AgentWorkspace 缩减为编排层

删除 `formData` 及所有 14 个相关的 `useEffect`。AgentWorkspace.tsx 最终只保留：
- `useAgentSession()`（SSE 流 + 操作）
- `useDesignSync(session)`（数据同步）
- 布局骨架 + 阶段路由

目标：≤ 500 行。

---

## 五、影响范围

| 层 | 文件 | 改动类型 |
|---|---|---|
| DB | `models.py` + 1 个 Alembic 迁移 | 新增 nullable 列 |
| 后端 | `schemas.py` | `AgentSessionOut` 新增可选字段 |
| 后端 | `skill_runner.py` | 结尾插入 ~20 行聚合代码 |
| 前端 | `design-store.ts`、`use-design-sync.ts` | 新文件 |
| 前端 | `panels/` 下 5 个 Panel | 新文件，从 AgentWorkspace 拆分 |
| 前端 | `AgentWorkspace.tsx` | 逐步删减 |

**不改动**：`llm_client.py`、`prompt_compiler.py`、`section-parser.ts`、`hooks.ts`、`api.ts`、所有后端路由。

---

## 六、风险与对策

| 风险 | 概率 | 对策 |
|---|---|---|
| 当前 prompting 阶段 LLM 输出的 `stream_a`/`stream_b` JSON 块中不包含 `palette`/`mood` 等字段，聚合后 `design_json` 字段不完整 | 高 | 聚合代码对缺失字段返回空数组 / null，前端 UI 做空态降级 |
| 双数据源并行期（Step 3-6）`formData` 与 `DesignStore` 存在同步不一致 | 中 | `useDesignSync` 单向同步（DesignStore → formData push），Step 7 彻底删除 formData 后消除 |
| 组件拆分引入回归 | 中 | 按 Panel 逐个拆分，每个 Panel 独立 typecheck + build 验证 |
| 老会话 `design_json = null` 渲染异常 | 低 | 所有 Panel 兜底读取 `stream_a`/`stream_b`，`design_json` 优先但非必须 |
| 新增 Zustand 依赖 | 低 | ~1KB gzip，零 boilerplate，接入方式与项目现有依赖复杂度一致 |

---

## 七、验收标准

- [ ] prompting 阶段后端成功生成 `design_json`
- [ ] Stage 2 编辑区从 DesignStore 渲染，不再解析 `[[SECTION]]` 自然语言
- [ ] 用户编辑文案后，AI 新推荐不覆盖（脏标记验证）
- [ ] Stage 1 对话界面行为与改前一致
- [ ] `AgentWorkspace.tsx` ≤ 500 行
- [ ] `pnpm typecheck` 零错误
- [ ] `pnpm build` 成功
- [ ] `uv run pytest` 全部通过
- [ ] 老会话（`design_json = null`）正常回放
- [ ] README + AGENTS.md 同步更新
