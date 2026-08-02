# Poster Forge

供公司同事自助生成视觉物料的内部 Web 应用。详见 [`PRD-PosterForge-v0.3.md`](./PRD-PosterForge-v0.3.md)。

## Stack

Vite 5 + React 18 + Tailwind + shadcn/ui · FastAPI + SQLAlchemy + SQLite · 本地磁盘存储 · 工号无密码登录。

## 快速启动（macOS）

```bash
# 1. 装依赖（首次）
cd backend && uv sync && cd ..
cd frontend && pnpm install && cd ..

# 2. 配后端 .env（首次）
cp backend/.env.example backend/.env
# 编辑 backend/.env 填入 APIMART_BASE_URL / APIMART_API_KEY / SESSION_SECRET
# 如需 /admin：再填 ADMIN_WORK_IDS / ADMIN_ELEVATION_SECRET

# 3. 起服务
./start.sh
```

启动后会打印两个 URL：
- `http://localhost:5173` — 本机访问
- `http://<LAN_IP>:5173` — 同事通过公司 LAN 访问

## 验证

```bash
# 后端 health（仅本机可达）
curl http://127.0.0.1:8000/api/health

# 前端
open http://localhost:5173
```

## 开发

```bash
# 后端单跑（带 reload）
cd backend && uv run uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload

# 前端单跑
cd frontend && pnpm dev --host 0.0.0.0

# 测试
cd backend && uv run pytest
cd frontend && pnpm typecheck && pnpm lint
```

## 数据 / 备份

所有运行时数据在 `backend/data/`（gitignore），备份就是 `cp -r backend/data/ <somewhere>`。

## 文档

- [`PRD-PosterForge-v0.3.md`](./PRD-PosterForge-v0.3.md) — 功能规格（权威）
- [`CLAUDE.md`](./CLAUDE.md) — 技术约束 / Claude Code 协作约定
- [`docs/api_docs/`](./docs/api_docs/) — 代理 API 原始文档

---

## 更新日志（Changelog）

按时间倒序。每条对应一个 Git commit，括号内为短 SHA，可在
[GitHub commits](https://github.com/XJ-03/PosterForge/commits/main) 查看完整 diff。

版本号自 `v0.1.0`（2026-04-23 首个端到端可用版本）起按 [semver](https://semver.org/lang/zh-CN/) 计：minor 对应"新功能 / 大重构"，patch 对应"体验打磨 / bug 修复"。Phase 1 全程在 `0.x`，Phase 2 切真 SSO / 对象存储后再升 `1.0`。

### v0.9.1 — 2026-08-03 · 优化上传风格参考图时当前风格选择区的点击热区

- **动机**：用户反馈在上传风格参考图后，如果先点击了其他推荐风格，再次切回选中“当前风格（参考图片）”时可点击区域过小、且操作不便。
- **改动点**：
  - **前端 / `StyleSelector.tsx`**：移除在有 `hasStyleRef` 时对 `onClick` 的拦截，允许直接点击选中；
  - **前端 / `StyleSelector.tsx`**：在 `hasStyleRef` 为真时不再对子元素 `div` 阻止点击事件冒泡，使得整个输入框区域（包含内部 textarea）皆为点击热区；
  - **前端 / `StyleSelector.tsx`**：根据 `hasStyleRef` 动态调整 `cursor` 样式，在有参考图时将其呈现为 `pointer`，符合“只读选择”按钮的语义，避免误导。
- **取舍**：
  - **不触发 Focus**：在有风格参考图时，选中“当前风格（参考图片）”直接设为选中态，不再自动聚焦 textarea 或弹出虚拟键盘。

### v0.9.0 — 2026-05-14 · 参考图改走 apimart 专用上传端点（弃用 base64 内联）

- **动机**：apimart 上线了 `POST /v1/uploads/images` 专用上传端点，并在 generation 接口文档里加了 `<Warning>` 标注 "不再支持在生成接口中直接传入 base64 图片数据"。v0.8 那条"参考图绑 127.0.0.1 → 只能 base64"的限制由供应商主动解掉了 —— 既是性能优化（base64 +33% 膨胀 + JSON 序列化 + httpx 复制三次，单图内存峰值约 4× 原图），也是为了避开上游计划下线的旧路径
- **后端 / `proxy.py` 新增 `upload_reference_to_apimart`**：multipart POST 到 `/v1/uploads/images`，返回 72h 有效的稳定 URL。重试策略与 `_request_with_retry` 对齐（429/5xx 退避 4 次、timeout 2 次）。删除 `encode_reference_to_data_url`。`submit_image_task` / `run_image_generation` 形参 `image_data_urls` → `image_urls`，请求体里 `image_urls` 元素结构由裸 string 改为 `{"url": "..."}`（apimart 文档示例形式）
- **后端 / `jobs.py` 参考图上传并发化**：edit 路径下，先按 `reference_file_ids` 顺序读出 File 行，再 `asyncio.gather(*[_upload_one(...) for ref])` 并发上传到 apimart 拿 url 列表。上限 5 张，并发安全。本地参考图文件仍保留（用户历史复用 + 7 天 GC 不动）
- **后端 + 前端 / 单图上限 5MB → 10MB**：base64 内存峰值问题消失，可以放宽。apimart 端 20MB，10MB 留余量。改动点：`backend/app/routers/uploads.py · _MAX_UPLOAD_BYTES` + 错误文案、`test_uploads.py · test_upload_rejects_oversized`、`frontend/src/features/generation/components/SpotlightBar.tsx · MAX_BYTES`
- **取舍**：
  - **本地参考图副本不删**：历史复用、缩略图、7 天 GC 都依赖本地副本。apimart URL 只是"提交 generation 时用"的中转。每次生成多一次上传请求（5 张并发约 200–500ms LAN→公网），可忽略
  - **不预上传**：用户 POST `/api/uploads` 时不立即上传到 apimart —— 用户可能上传后不提交，会产生无效成本。改为在 jobs 层实际生成时按需上传
  - **错误码不新增**：apimart 上传失败映射到现有 `upstream_error` / `timeout`，与 generation 阶段同构；413（apimart 端 20MB 上限）我们靠 10MB 前置卡死永远到不了
  - **不写迁移**：纯运行时行为变化，DB schema 不动

### v0.8.0 — 2026-05-14 · 切到 apimart + 异步任务 + 比例尺寸 + 清晰度档位

- **动机**：图像生成代理商更换为 apimart（`api.apimart.ai`）。新供应商契约层面变了三处：(a) **异步任务模型** — 提交返回 `task_id`，需轮询 `GET /v1/tasks/{id}` 拿结果；(b) **统一端点** — 图生图不再有独立 `/v1/images/edits`，与文生图共用 `/v1/images/generations`，是否带 `image_urls` 决定模式；(c) **不再接受 `quality` / `n`** — 上游只支持 n=1，画质改用 `resolution` 档位（1k/2k/4k）
- **后端 / `proxy.py` 重写**：删 `call_generate` / `call_edit` / `_decode_data_item` / `_NeedsUrlFetch`；新增 `submit_image_task` / `poll_task_until_done` / `download_image` / `encode_reference_to_data_url` 四个函数 + `run_image_generation` 端到端编排。轮询节奏按文档建议：提交后等 12s（apimart 单图实测 30–60s 完成）、之后 4s/次、240s 上限抛 timeout。HTTP 单请求超时从 180s 压到 60s（异步 API 单请求很短）
- **后端 / 参考图传输改 base64 data URI**：apimart `image_urls` 字段接受公网 URL 或 base64 data URI。我们后端绑 127.0.0.1（无对象存储 — Phase 2 工作），**只能走 base64**。`jobs.py` 在 edit 模式下把所有参考图字节读入并编码成 `data:image/png;base64,…`，传给 apimart。Phase 2 上 OSS 后可改成签名 URL
- **后端 / 上传体积上限 50MB → 5MB**：base64 编码 +33%，加上 JSON 序列化与 httpx 内部一次复制，单图内存峰值约是原图 4×。50MB 原图会吃 ~200MB 内存 / 张，5 张并发吃 GB 级 — 不可接受。收紧到 5MB 后峰值 ~20MB / 张
- **尺寸语义改：比例 + 清晰度（v0.7 像素预设废弃）**：apimart 把 `size`（画面比例）与 `resolution`（清晰度档位）做成两个正交字段。要让用户能切 1K/2K/4K，size 必须传比例而非像素。所以恢复"按比例选 + 1K/2K/4K 段控件"两段式 UI：

  | 比例 | 场景名 |
  |---|---|
  | 1:1 | 方图 |
  | 4:3 | 横向 PPT |
  | 3:4 | 小红书 |
  | 16:9 | 宽屏 |
  | 9:16 | 海报 |
  | 3:2 | 摄影 |
  | 2:3 | 杂志 |
  | auto | 跟随参考图（仅 edit；选中时清晰度段控件灰掉） |

  v0.7 的 6:7（视频号封面）/ 16:7（Banner）/ 2.35:1（公众号头图）/ 1:2.5（超长图）四档非标准比例本期下线 —— apimart 标准比例集里没有，硬传像素就拿不到清晰度切换。Banner 等需求可用 16:9 + 4K 覆盖
- **新增清晰度段控件**：1K / 2K / 4K，默认 1K。`size=auto` 时禁用（输出像素跟随参考图，resolution 不参与上游计算，但仍持久化用户选择以保持复用语义一致）
- **DB params 结构**：`{size: "1:1", resolution: "1k"}`。老数据（v0.7 像素 / v0.6 之前枚举 / v0.8 早期无 resolution）由 Pydantic Optional + 前端 parseSize 双兼容
- **前端 ParamsRow 重画**：去掉 quality 段控件 + 张数段控件；尺寸卡片改"ratio box + 主名（场景）+ 副名（比例）"；新增清晰度段控件；底部 tag 行从 `尺寸·画质·张数` 改为 `尺寸·清晰度`
- **前端 / 轮询超时 200s → 300s**：后端轮询上限 240s + 网络/重试余量
- **配置 / env 改名**：`PROXY_BASE_URL` → `APIMART_BASE_URL`，`PROXY_API_KEY` → `APIMART_API_KEY`
- **取舍**：
  - `quality` UI 删除而非映射到 `resolution`。"quality 高 → resolution 4k" 这种硬塞会误导（quality 在 unifyllm 时代是 silent-ignore，含义本就模糊）；不如直接让用户面对清晰度档位
  - n=2 / n=4 批量生成移除。apimart 不支持，硬要支持得后端串行调 N 次、成本翻倍、用户等待翻倍，收益低
  - 比例只暴露 7 档（apimart 支持 14 档）。21:9 / 9:21 / 3:1 / 1:3 / 5:4 / 4:5 / 2:1 / 1:2 这些场景使用频率极低，UI 拥挤代价大于收益
  - 参考图上限张数保持 5（apimart 支持 16）。"换 API"和"提上限"是两件事
  - 不写 alembic 迁移。`params` 是 JSON blob，老数据字段留着不读即可，schema Optional 兼容
  - 不删除 `Generation.revised_prompt` 列。apimart 不返回此字段，新条目永远 NULL；删列要写迁移、收益为零

### v0.7.1 — 2026-04-28 · 设置面板改为 outside-click 关闭

- **动机**：v0.7.0 起 SpotlightBar 的设置面板（尺寸/质量/张数）打开后，关闭只能点 ✕、再点设置图标、或按 Esc。点 textarea 开始写 prompt、点空白都关不掉，主任务被无端阻断。这违背了"设置面板只是参数子菜单，不是 modal"的产品定位
- **三条新关闭路径**：点 textarea / 点任何主区按钮（发送、上传、参考图）/ 点空白区域，全部即关。Esc + 再点设置图标 toggle 仍保留
- **`SpotlightBar.tsx`** 加 `popoverRef` + `settingsBtnRef`；新 `useEffect` 挂 `pointerdown` 监听，target 不在 popover 内、也不在 toggle 按钮内就关。用 `pointerdown` 而非 `click` 是因为它早于 `focus`，"点 textarea 关 popover" 的同时焦点能正确落入 textarea，零割裂
- **去掉 popover header 上的 ✕**：✕ 在轻量浮层上是"产品自信不足"的信号，会让用户以为浮层是 modal、必须关掉才能继续。三条关闭路径已覆盖键鼠 / 键盘 / 触摸，✕ 是冗余出口。同步把 header 从 flex 行改成 ParamsRow 风格的轻量 uppercase 副标题（"生成参数"），视觉与内部小标题对齐
- **不会被关闭的两类操作**：(a) 在 popover 内点击（选档位、段控件）；(b) 拖拽参考图入窗 — `dragOver` 监听在 window 上，不触发 `pointerdown`，drop 完用户回头还能继续调参数

### v0.7.0 — 2026-04-28 · 尺寸切到 7 档场景化预设（小红书 / 视频号 / 公众号 …）

- **动机**：之前固定 3 档（方/横/竖）+ edit 端 auto，覆盖面太窄；同事最常做的小红书封面 (3:4)、视频号封面 (6:7)、公众号头图 (~2.35:1) 全没有合身的档位。代理商核对后确认上游 `gpt-image-2` 接受任何满足官方约束（16 倍数 / 最长边 ≤ 3840 / 长短比 ≤ 3:1 / 像素 0.65M~8.3M）的 `WIDTHxHEIGHT`，不止文档里列的几档
- **新预设 7 档** + edit 端 `auto`，两端使用同一份白名单（generate 不允许 `auto`）：

  | 比例 | 场景名 | 像素 | 主要平台 |
  |---|---|---|---|
  | 1:1 | 方图 | `2048×2048` | 小红书方图 / 朋友圈九宫格 / 公众号小图 |
  | 9:16 | 海报 | `2160×3840` | 抖音 / 快手 / 直播预热 / 竖版广告 |
  | 3:4 | 小红书封面 | `1536×2048` | 小红书图文 / 视频封面 |
  | 6:7 | 视频号封面 | `1536×1792` | 微信视频号 |
  | 16:7 | Banner | `2560×1120` | POP 趋势 & AI 智绘首页 |
  | ~2.35:1 | 公众号头图 | `1808×768` | 微信公众号 / 头条号题图（输出后人工裁切到平台比例） |
  | 1:2.5 | 超长图 | `1024×2560` | 微博长图 / 知识卡片 / 活动说明 |

- **DB 字段语义变了** — `generations.params.size` 从枚举值（`square` / `landscape` / `portrait` / `auto`）改为存真实 `WIDTHxHEIGHT` 字符串（小写 x，与代理 wire 格式一致）。alembic 迁移 `c2d3e4f56789` 按 `action` 把旧值映射进真实像素（`landscape` 在 generate 是 1792×1024、在 edit 是 1536×1024），历史卡片不需要任何兼容代码即可正确渲染
- **后端**：`proxy.py` 删 `SIZE_MAP`，size 直接 passthrough；`routers/generations.py` 用新 7 档白名单（仍区分 `auto` 仅 edit）
- **前端单一数据源** `features/generation/size-presets.ts`：UI 与后端同步从这一份清单读，新增档位一处改两端生效
- **UI 改动**：`ParamsRow` 网格从 `grid-cols-3/4` 改为 `grid-cols-4` 自动 2 行；卡片放大到 104px，**比例由真实 aspect-ratio 的白色矩形传达**（长边 56px，3:4 与 6:7 视觉差 ~7px 但场景名不同足以区分），文字只承载场景名 — 数字噪音清零
- **缩略图 aspect** 从写死 `aspect-[w/h]` Tailwind 类改为 inline `style.aspectRatio`（Tailwind JIT 扫不到模板字符串拼接的动态类名，旧写法只能枚举所有 W/H，新写法对任意尺寸都对）

### v0.6.3 — 2026-04-28 · 历史 / 画廊改用行优先瀑布流

- **`e11eea5` fix(layout): 历史 / 管理员画廊改用行优先瀑布流，按时间顺序左→右阅读**
  - **现象**：用户反馈画廊和工作区的历史"排序乱"。排查后端两个端点 `GET /api/history` 和 `GET /api/admin/gallery` 都正确按 `created_at DESC` 返回；问题在前端
  - **根因**：旧版 `columns-1 md:columns-2 xl:columns-3` CSS columns 瀑布流是"列优先"填充：item 1,2,3 入第 1 列、item 4,5,6 入第 2 列、item 7,8,9 入第 3 列。顶行视觉上是 第 1 / 第 4 / 第 7 张，与人眼"左→右 上→下"读法对不上。再叠加 5 种宽高比（1:1 / 3:2 / 2:3 / 7:4 / 4:7），列高度参差更显错乱
  - **新组件** `components/layout/row-masonry.tsx`：`matchMedia` 跟 Tailwind 断点对齐（<768→1 列 / <1280→2 列 / ≥1280→3 列），items 按 `index % cols` 轮询分到 N 个 flex 列。顶行 = 最新 N 张，左→右匹配 `created_at DESC`
  - **`workspace.tsx`** 历史卡片网格 + 骨架屏迁移；`scrollTo({ top:0 })` 仍正确（新 pending 卡片在 index 0 → 第 0 列首位 → 视觉左上角）
  - **`AdminGallery.tsx`** 网格 + 骨架屏同步迁移
  - **取舍**写在 row-masonry.tsx 顶部注释：列归属由 `index` 决定，prepend 一张会让所有现有项跨列移动 → React 卸载/重建。规模小（屏内 ~20 张）+ 浏览器图片缓存兜底，可接受。换来的是"按时间读 = 左→右 上→下"的直观语义；列高不再自动平衡，底部参差是这个交易的代价

### v0.6.2 — 2026-04-28 · edit 端新增 size=auto

- **`0fdea49` feat(edit): edit 端新增 size=auto — 由上游模型按参考图自适应**
  - **动机**：edit 模式的固定三档（1024² / 1536×1024 / 1024×1536）在参考图比例不规整时（如长截图、3:4 海报）会被裁/拉，效果差。代理 `/v1/images/edits` 文档列出 `auto`，由上游按参考图自适应输出比例，正好填这个洞
  - **后端契约扩展** `SizeKey = {square, landscape, portrait, auto}`：`SIZE_MAP.edit` 注册 `auto -> "auto"`；generate 端不暴露（`/v1/images/generations` 不接受 `auto`，`routers/generations.py` 在校验层显式拒绝 `generate + size=auto`，避免代理 400 透出给用户）
  - **前端 `ParamsRow`** 在 edit 模式下从 3 列升 4 列，`auto` 用虚线方框图标 + 像素提示文案 "跟随参考图"（上游不返固定像素，避免误导）
  - **缩略图占位**：`HistoryCard` / `AdminGalleryCard` 对 `auto` 用 `aspect-[1/1]` 占位 + `object-cover` 兜底，等真实图回来后浏览器自动展示真实比例
  - **`workspace.tsx` 兜底 useEffect**：用户在 edit 选了 auto 后清掉所有参考图回到 generate 时，自动把 size 回落到 `square` — 否则提交会被后端 400
  - **类型穿透**：`features/generation/api.ts`、`features/admin/api.ts`、`SpotlightBar`、`history/format.ts` 等所有 `Record<SizeKey, ...>` 字典补 `auto` 项，TS strict 不漏

### v0.6.1 — 2026-04-28 · 用户详情图字段向管理员画廊对齐

- **`d5d719c` feat(history): 用户详情图字段向管理员画廊对齐 — 参考图 / 完成时间 / 完整 prompt**
  - **动机**：管理员画廊点开生成详情看到的字段（参考图缩略图、绝对完成时间、完整 prompt / 改写后 / 失败码）比用户在工作区点"详情"看到的要多一截。两边代码各写各的，对同一份 generation 的展示密度不一致。本版把用户端拉齐，仅去掉用户身份头（用户视角不需要看自己的工号 / 姓名）
  - **后端契约扩展** `GenerationOut`：新增 `reference_files: list[FileRefOut]`；`GET /api/generations/{id}` 同时拼装 output + reference 两组 FileRef，URL 走 `/api/files/{id}` 鉴权端点（不暴露代理 url）
  - **前端 `HistoryDrawer` 重写**为 admin 同款 Field 布局：完整 Prompt / 改写后（去掉 `line-clamp-3` / `line-clamp-2` 截断）、参数、参考图缩略图（点击进 `ImageViewer` 多图轮播）、失败 banner（图标 + error_code + error_message）、绝对时间行（创建 / 完成）。底部保留用户专属的 复用 / 下载 / 删除三键
  - **header 仍只显示** `动作 · 相对时间`（不含工号 / 姓名），避免视觉冗余
  - **测试**：`tests/test_generations.py` 加两条 — edit 详情吐 `reference_files`、generate 详情 `reference_files == []`；后端 31 → 33 项

### v0.6.0 — 2026-04-28 · 参考图上传解耦：选完即传 + 每张独立进度/重试

- **`3191a23` feat(uploads): 参考图选完即传 — 解耦 /api/uploads + 每张独立进度/重试**
  - **动机**：旧版"提交时一并 multipart 上传"在大图（>5MB）下没有可见进度（fetch 无 `upload-progress` 事件），用户等待时不知道发生了什么。v0.5.0 时给提交端加过 XHR 真实进度，但仍是"点提交才开始传"，与微信 / Notion / ChatGPT 习惯不一致。本版改为选完即传，提交时只发 `file_id`
  - **后端新端点** `POST /api/uploads`：单张 multipart，校验 MIME / size / 空文件，复用 `storage.save_upload` 存盘 + 写 `files` 表，返回 `{ file_id, url, width, height }`
  - **后端契约改动** `POST /api/generations`：`reference_images: list[UploadFile]` → `reference_file_ids: list[str] = Form`（前端同字段名重复 append）。后端从 `files` 表按 id 取，校验 `user_id == current_user.id` / `kind == 'upload'` / `deleted_at IS NULL`；任何不匹配统一返回 `invalid_input`（不泄露存在性）。`generate` 模式收到 stray ids 静默丢弃，不入库
  - **前端 hook** `useReferenceUploads`：每张图独立 `{ tempId, file, fileId?, progress, status, errorMsg }`；提供 `add` / `remove` / `retry` / `clear`，派生 `readyFileIds` / `allReady` / `hasFailed` / `hasUploading`；选完即调 `apiUpload` (XHR + `upload.onprogress`)
  - **`MIN_UPLOADING_VISIBLE_MS = 600`**：LAN 上几十 ms 就传完，人为保留 600ms 让进度条至少能从 0 拉到 100% 给用户看到（XHR resolve 时立即把 `progress` 拍到 1，settle 延迟到 ready）
  - **SpotlightBar 缩略图三态视觉**：uploading（图片 50% 透明 + 半透黑遮罩 + 中央 `%` 文字 + 底部白条按字节拉伸）；ready（左下角小绿 ✓ 常驻，白色描边任何背景上都清晰）；failed（左下角小红 ⚠ 常驻 + hover 显示红色 RefreshCw 覆盖；点图即重试；X 移除按钮失败时始终可见）
  - **提交按钮 disabled 升级**：`!prompt || isBusy || !allReady || hasUploading || hasFailed`，hover title 解释卡在哪里
  - **顶部 status 行**去掉旧的"上传中 X%"阶段（per-thumbnail 接管），保留 uploaded（"已提交，加入队列…" 1.2s 脉冲）→ queued → generating 三段
  - **测试**：新建 `tests/test_uploads.py` 5 项（success / 401 / bad MIME / empty / oversized）+ 改写 `tests/test_generations.py` 7 项（含跨用户偷 file_id 防御 + generate 静默丢 stray id + 上传文件可被 owner 取回）；后端 21 → 29 项
  - **CLAUDE.md §8**：加一行架构决策记录解释为什么解耦；orphan upload 沿用现有 7 天 GC，不加 DELETE 端点

### v0.5.0 — 2026-04-27 · 多图编辑（1–5 张参考图）+ 代理线路切换

- **`7973d06` feat(edit): 1–5 张参考图 + 切换 apicn 高并发线路**
  - **解除 §11 多图 deferral**：M3 时只观察到代理 200（伴随 silent-ignore），证据不足；2026-04-27 代理商明确回复多图 OK，才放行。仅多图解除，`mask` / `input_fidelity` 仍按"silent-ignore 不可证"维持不发送
  - **DB 迁移** `b1c2d3e4f567`：`generations.reference_file_id` 单 FK → `reference_file_ids` JSON 数组（TEXT），与 `output_file_ids` 一致风格；旧数据自动回填为单元素数组
  - **后端**：`proxy.call_edit` 改收 list-of-tuples，httpx `files=[("image", ...), ("image", ...), ...]`（RFC 7578 同字段名重复）；`routers/generations.py` 加 `_MAX_REFERENCE_IMAGES=5`、单张 50MB / png-jpeg-webp 校验；`jobs.py` 按上传顺序加载并传给 proxy
  - **前端**：`SpotlightBar` 单槽 → 水平最多 5 槽 + 末尾 "+" 添加按钮；拖拽 / 文件选择支持多文件；超量截尾时小红字提示 3s；每张缩略图点击进 `ImageViewer` 多图模式；`AdminGenerationDrawer` 参考图字段从单 80×80 → 一排 64×64 缩略图，点击进 viewer 多图轮播
  - **代理线路** `apihk.unifyllm.top` → `apicn.unifyllm.top`（同一家代理，国内优化高并发线路），`.env` / `.env.example` / `CLAUDE.md §6` 同步
  - **测试**：新建 `backend/tests/test_generations.py` 4 项 — 空参考图 / >5 张 / 错 MIME / 2 张成功并验证 DB；后端测试 17 → 21 个
  - **顺手合入**之前在 working-tree 里没提交的"真实上传进度 + ✓ 已上传脉冲"：`apiUpload()` 用 XHR 暴露 `upload.onprogress` 真实字节进度（fetch 没有这个事件），`useCreateGeneration` 把 0..1 的 progress 透传出来；`SpotlightBar` 加 4 阶段 status（uploading → uploaded → queued → generating），底部进度条按阶段切换样式

### v0.4.1 — 2026-04-27 · 输入法兼容修复

- **`643043d` fix(spotlight): 拦截 IME composition 中的 Enter，避免中文选词误发**
  - `SpotlightBar` 的 Enter 提交在 `e.nativeEvent.isComposing || e.keyCode === 229` 时放行
  - 中文/日文输入法选词阶段按 Enter 只上屏候选词，不会触发 `onSubmit`
  - 两个判断都保留：`isComposing` 是标准 API，`keyCode === 229` 是部分浏览器的兜底信号

### v0.4.0 — 2026-04-27 · 沉浸式图片查看器（点击放大）

- **`f0e7332` feat(viewer): 沉浸式 ImageViewer — 缩放 / 拖拽 / 多图切换 / 键盘**
  - 新建 `frontend/src/components/ui/ImageViewer.tsx`：全屏 `#0a0a0a/95` 深底 + 微 backdrop-blur；浮动玻璃工具条（`white/6` + `white/10` border + `backdrop-blur-md`），2.2s 不动自动淡出
  - 滚轮缩放 1×–8×，**以光标位置为锚点**；macOS trackpad pinch (`ctrlKey + wheel`) 兼容
  - 双击切换 1× ↔ 2.5×；放大态拖拽平移；1× 时点空白关闭
  - ←/→ 切组内多图；ESC/✕ 关闭；+/-/0 键盘缩放复位；底部工具条显示百分比 + 复位 + 下载
  - 接入 4 处：workspace `HistoryDrawer` hero、admin `AdminGenerationDrawer` hero + 参考图、workspace `SpotlightBar` 已选参考图缩略图
  - 嵌套 ESC 修复：viewer 打开时 drawer 的 Esc 监听让位，避免一键级联关闭两层
  - 顺手把 `SpotlightBar` 参考图"hover 全屏覆盖即删除"的怪 UX 改成"右上角小 ✕ 删除 + 主缩略图点击查看大图"

### v0.3.0 — 2026-04-27 · 管理员面板扩展 + 品牌视觉

- **`f5a963c` feat(admin): 全局画廊 + 任务详情 + 拆分维度 + 7 天趋势 + 存储水位 + 用户搜索**
  - 全局画廊：`/api/admin/gallery` 跨用户分页 masonry；卡片左上浮工号 chip；filter 区三轴过滤（动作 / 状态 / 用户）
  - 任务详情：`/api/admin/generations/{id}` 完整 payload；前端只读 lightbox 抽屉，用户头部 + 参考图缩略图 + 多输出 carousel + 错误详情；接到画廊卡和概览失败列表
  - 生成 / 编辑维度拆分：`AdminPeriodOut` 嵌 total / generate / edit 三组；MetricCard 改为大数字 + 双列拆分；top users 加每用户的 g/e 计数
  - 7 天趋势：`/api/admin/stats.last_7_days` 单 SQL 按 UTC 自然日 group + 补 0；前端纯 div 高度做 sparkline（成功段 + 失败段两色 stack），未引图表库
  - 存储水位：`/api/admin/storage` 返回 uploads / outputs 双 bucket（bytes / 文件数 / 最早 / 逾期）；醒目提示「自动清理未启用」—— PRD §4.6 描述了 7d/30d 保留期但 Phase 1 未实现 cleanup task
  - 用户搜索：`/api/admin/users?q=` 用 `lower()+LIKE` 在 work_id/name 上做不区分大小写匹配；前端 UserPicker combobox（220ms debounce、外部点击 / Esc 关闭、已选变 chip），接到画廊 `user_id` 过滤
  - admin 测试 3 → 8 个，覆盖各新接口的 403 elevation 门 / filter / 边界
- **`33a0044` ui(brand): 自绘 BrandMark + 单色 favicon 替换原紫色 logo**
  - 新增 `BrandMark` 组件（753×753 viewBox 单 path，`currentColor` 跟随文字色）
  - top-nav wordmark 前 20px logo；登录页标题上方 48px logo
  - `favicon.svg` 同步换单色版（#37352F），呼应 Notion 风深色文字

### v0.2.1 — 2026-04-26 · UI 体验打磨

- **`94d674e` ui: 历史画廊瀑布流 + 详情自适应 + 卡内态打磨**
  - 历史列表 CSS Grid → CSS columns 多列瀑布流，短横图卡片下方不再留出空白
  - 卡片宽高比按 (action, size) 精确映射 API 输出比例（generate 7:4/4:7、edit 3:2/2:3）
  - 详情视图模态宽度由图片真实比例驱动 `clamp(360px, 70vh×ratio, 90vw)`，消除黑边
  - 卡内"生成中 / 失败"独立态：quiet spinner + shimmer + 实时计时；错误码本地化文案
  - SpotlightBar textarea 高度上限 160px → 280px，自定义 6px 细 scrollbar
  - SpotlightBar 移除独立 `onAction`：模式由 `refImage` 派生，UI 与 state 永不打架
  - 画质标签 低/中/高/自动 → 低画质/中画质/高画质/自动画质
  - 提交后自动 scroll 顶部，看见 pending 卡进入历史
  - 设计 token 同步 PRD：圆角分层级（图标 6 / 卡片 8~12 / 浮层 16）、hover 允许 ≤2px 位移

### v0.2.0 — 2026-04-24 · M4 + UI 重塑

- **`409c1de` polish(ui): 7-item UX refinement pass** — 视觉细节 7 项调整
- **`3d8dc38` feat(ui): radical 2026 UX redesign — Spotlight + Infinite Canvas** — 工作区彻底重构为 Spotlight 输入 + 无限画布历史
- **`3c18f0f` Add admin panel and polish workspace UI** — 管理员面板（用户列表 / 任务统计） + 工作区打磨
- **`906298d` proxy: revert model to mix/gpt-image-2 (back on aigc group)** — 因官方端点配额回滚到 aigc 分组的 `mix/gpt-image-2`
- **`f46fe65` proxy: switch to official gpt-image-2 + harden SSL/quota error paths** — 短暂尝试官方 `gpt-image-2`，加固 SSL / quota 错误路径
- **`d1e38b8` M4: history page with cursor pagination + reuse + soft-delete** — 历史页（游标分页） + 复用 + 软删除（30 天）

### v0.1.0 — 2026-04-23 · M0 ~ M3 主链路打通

- **`fa207f9` M3: image-edit flow + capability probe results** — 编辑流程 + 代理能力实测（确认 `mask` / `input_fidelity` 等参数 silent ignore，不引入 UI）
- **`f3a8c06` fix: client-side timeout fired immediately due to naive UTC datetime** — 修 SQLite tz round-trip 丢失 → JS 按本地时区解析 → 偏 8 小时 → 客户端瞬时超时；后端 datetime 强制 UTC ISO
- **`cec1797` M2: end-to-end image generation** — 生成端到端，含 model 名 quirk（裸 `gpt-image-2` → `model_not_found`，改 `mix/gpt-image-2`）和 b64_json data-URL 解析修复
- **`85ed54c` M1: work-id no-password auth + login skeleton** — 工号无密码登录 + itsdangerous 签名 cookie（30 天）
- **`3f64205` M0: scaffold v0.3 stack — Vite + FastAPI + SQLite** — 推翻 v0.2 Next.js 原型，从零起 v0.3 双进程栈

### 2025-12-14 · v0.2 原型期（已弃）

- **`0f0ceab` Implement core UI components and premium design system**
- **`dc1fed6` Initialize Next.js project with Shadcn UI and dependencies**
- **`d9e38f2` Initial commit of PRD and API reference**

> v0.2 是 Next.js 全栈原型，仅作 PRD 阶段视觉参考。v0.3 起拆为前后端双进程（见 `M0`）。
