# LLM Space 能力地图

- 最后更新：2026-08-12
- 地图状态：游客工作台 Hosted Alpha 已在线运行；截至提交 `f413847`，Web Agent 案例库 V1 已发布为腾讯云版本 `20260812-131315-f4138476f82c`，线上可从 9 个案例创建独立可调试 Thread。根地址直接进入游客工作台，Landing 保留在 `#/about`。天气 ReAct 完整闭环已经验证可用，但全新浏览器的默认 Run 设置仍关闭 ReAct 与自动工具执行，首次点击 Run 会停在工具结果调试阶段；启用 ReAct 后可自动完成工具调用与模型续答。GitHub 登录、BYOK、租户级持久 Thread、账单、Bash、stdio MCP、Generator，以及公共远程 MCP 的网络层出站策略仍需独立安全边界；身份、Personal Tenant、PostgreSQL 与强制 RLS 基础仍未接入游客入口。当前没有公开或动态加载的插件。
- 证据规则：`confirmed` 表示有当前渲染产品或当前代码证据；`stale` 表示依赖旧日志或本轮未完全复查的代码路径；`unknown` 表示需要未来重新检查产品界面后才能用于决策。

## 交互式浏览器工作台

- 状态：线上 Hosted Alpha 可用；三款资源包对齐模型、单行顶部、固定高度设置、工作台优先入口和中文使用说明已部署并完成线上验收
- 新鲜度：confirmed
- 最后检查：2026-08-12
- 证据：
  - 当前线上 `https://kandian.site/llm-space-web/` 会直接重定向到 `#/workbench`；介绍页保留在 `#/about`，两个路由均恢复正确的浏览器标题。
  - 2026-08-01 功能发布为 `20260801-083709-a49c04be1c64`，对应提交 `a49c04be1c6488bd77e5fed16940b9e2516c6f72`；systemd 服务为 active，Nginx 配置与本机 API 检查通过。
  - 本地实现将单一 `llm-space.guest.thread.v1` 数据迁移为版本化的 `llm-space.guest.workspace.v1` 工作区；新格式写入成功后才删除旧键。
  - 游客现可在左侧响应式抽屉中新建、选择、复制、导出、删除 Thread，并可通过工作台标题重命名；导入 JSON 会创建新 Thread，不覆盖已有记录。
  - 首次访问会立即持久化示例 Thread；刷新会恢复最后打开项；删除最后一项会自动创建新的示例 Thread。
  - Run 期间，新建、切换、复制、导入、删除和重置均被锁定，只读导出仍可用；停止后操作恢复。
  - 聚焦数据测试覆盖初始化、旧数据迁移、存储读写失败、Thread 生命周期、导入和导出，共 10 项通过。
  - 真实浏览器流程完成新建、重命名、刷新恢复、导出、确认删除、重新导入和 Run 锁定验收；最终受控浏览器上下文控制台为零错误、零警告。
  - 768px 视口满足 `documentElement.scrollWidth === innerWidth === 768`，打开抽屉后没有页面级横向溢出。
  - 审计截图位于 `audits/2026-07-29-guest-thread-library-v1/`，包括桌面 Thread 资料库、Run 锁定状态和 768px 响应式抽屉。
  - 2026-07-29 的发现基线以受控 429 响应确认：旧版本失败只通过短暂 Toast 呈现，没有持久错误状态、恢复入口或失败历史。
  - Run 错误恢复 V1 现已在本地提供页面会话级持久结果条，区分临时服务、日额度、输入限制、短期限流和用户主动停止，并按类别决定是否提供手动“重新运行”。
  - 失败和停止会保留 Thread 与已生成的部分输出；重试从原始用户消息开始并替换不完整助手输出；失败与停止不会写入成功 Run 历史。
  - 游客服务端为普通错误和 SSE 中途错误返回安全请求编号与结构化错误码；浏览器技术详情只显示错误码、适用的 HTTP 状态和本站请求编号，不暴露密钥、认证头、原始上游响应或堆栈。
  - 15 个聚焦测试覆盖服务端协议、Web 错误解析与分类、部分输出保留、停止和重试语义；完整 lint、类型检查、默认 Web 构建和游客 Web 构建均通过。
  - 真实 Chromium 已完成临时服务失败后手动重试成功、额度耗尽、输入过大、短期限流和主动停止五类受控流程；只有 429/413 请求本身产生浏览器网络资源日志，没有应用主动输出的错误或堆栈。
  - 当前验收截图位于 `output/playwright/run-recovery-v1/`，包括临时失败技术详情、额度耗尽、主动停止和 768px 结果条布局。
  - `apps/web/src/host/web-host.ts` 已注入游客 Built-in/MCP 执行器与独立工具策略；浏览器虚拟文件、Custom 人工结果、同源演示 MCP、低风险自动执行和 ReAct 已可用。
  - 部署后真实 Chromium 刷新仍恢复 Thread、Run 历史、`read`、演示 MCP 和 Custom Tool；浏览器控制台为零错误、零警告。
  - 线上 Models API 只暴露当前资源包已验证的 `glm-4.5-air`、`glm-4.7`、`glm-4.6v`，默认模型为 `glm-4.5-air`；旧浏览器默认值和旧服务端环境变量会安全迁移到新默认模型。
  - 部署前腾讯云主机直连智谱、部署后本站游客 `/runs` SSE 均逐一验证三款模型：3/3 返回 HTTP 200、完整结束事件和非空“线上测试成功”，无流式错误。
  - 真实 Chromium 默认模型 Run 在 573ms 返回“浏览器测试成功”，额度由 20/20 正常变为 19/20，Run history 记录为 `bigmodel/glm-4.5-air`。
  - 新 Thread 默认使用“搜索一下广州今天的天气”及 `weather_report`、`web_search`、`web_fetch`，同时保留已有 Thread；模型错误会保留 Thread 并建议切换其他智谱模型。
  - 顶部常驻说明已收进可点击信息图标；真实 Chromium 在 768px 与 1920px 下测得顶部高度均为 49px、左右内容同处一行且无横向溢出。
  - 设置弹窗固定为 640px 大高度；外观、模型、MCP 三个 Tab 实测高度完全一致，模型 Tab 只显示上述三款模型。
  - 顶部设置入口和 7 篇 Web 专用中文 Markdown 使用说明已上线；真实 Chromium 已验证浅色/深色主题、演示 MCP 入口、文档新标签、390px 无横向溢出和移动端目录抽屉。
  - 线上真实检查中发现 pi SDK 会把部分上游 429 作为 `stopReason: error` 的普通事件返回；服务端已在提交 `5ad70fd` 中统一拦截并转换为脱敏的 `guest_run_error`，浏览器不再看到上游错误正文、余额信息或供应商错误码。
  - 线上 `weather_report`、`web_search`、`web_fetch` 与演示 MCP 均返回 200；伪造模型、错误 Origin、私网/元数据地址和公共远程 MCP 分别按预期被拒绝。
  - 本轮 38 个聚焦测试、零警告 lint、全仓类型检查、默认 Web 构建、游客 Web 构建和 Guest API 打包通过；完整仓库测试为 411 通过、1 跳过、6 失败，失败来自本轮未改动的 Windows 路径、符号链接和生成的 Python/清单同步基线。
  - 线上真实 Chromium 控制台为零错误、零警告；Models、Quota 和 Run 请求均返回 200。
  - 线上审计截图与中文验收记录位于 `audits/2026-08-01-guest-first-run-docs-models-online/`。
  - 2026-08-12 案例库发布后，活动发布目录为 `20260812-131315-f4138476f82c`，`RELEASE_COMMIT` 为 `f4138476f82c04fda270555ef8baa9f3326f38f4`；`llm-space-web.service` 为 active、`NRestarts=0`，内网健康检查返回 `llm-space-guest-api` 与 `glm-4.5-air`。
- 能力边界：未登录游客可管理多个浏览器本地 Thread，编辑 Prompt、消息、变量、工具和模型参数，选择服务端白名单内的智谱模型，完成安全工具/ReAct 闭环，查看 Run 历史和剩余额度，并通过 JSON 导入导出携带单个 Thread。Thread 与虚拟文件仍不在服务端同步或持久化。
- 明确非目标：不宣称已经达到生产级多用户 SaaS；不暴露供应商或 Langfuse 密钥；不开放宿主 Bash、宿主文件系统、stdio MCP、Generator、原生菜单、更新器、窗口控制或系统文件选择器。
- 可见缺口：三款可见模型普通 Run、GLM-4.6V 图片问答和“模型发起天气 Tool Call—自动执行—模型整理答案”的完整天气 ReAct 闭环均已在线验证。失败结果仍不跨刷新持久化，也没有失败时间线、后台重试或静默故障转移。公共远程 MCP 上线前还需腾讯云网络层出站限制；BYOK、登录激活、租户级 Thread CRUD、多标签 Workspace、分布式额度、审计监控、备份和更强滥用防护仍待开发。

## Web Agent 案例库

- 状态：V1 已提交、推送并部署到腾讯云 Hosted Alpha，线上真实 Chromium 验收完成
- 新鲜度：confirmed
- 最后检查：2026-08-12
- 证据：
  - 当前 Web 顶部已有常驻“案例”入口，Thread 抽屉的“从案例新建”进入同一选择界面；运行中两个入口均锁定。
  - 案例库保留 Web 天气 Agent，并迁移桌面共享层全部 8 个案例：Blank、General Agent、Deep Research、Translation、Deep Wiki、Compact Memory、Meta Prompt、Meta Image Prompt，共 9 个。
  - 选择案例会创建并切换到独立浏览器本地 Thread，不覆盖已有 Thread；`starterId` 随工作区记录持久化，复制保留来源，旧工作区和导入 Thread 继续兼容。
  - Deep Research 实际带入完整研究 Prompt、两条初始消息与 `web_search`、`web_fetch`、`todo_write`；General Agent 保留 Skills、Web 与浏览器虚拟文件工具，并剔除 Bash、不可执行提问工具和插件式子 Agent。
  - 线上真实 Chromium 从天气 Thread 打开案例库、选择 Deep Research、刷新恢复、临时修改消息再按来源重置均通过；Thread 数量从 1 增至 2，原天气 Thread 保留。
  - 线上 1440px 与 768px 均通过；768px 实测 `documentElement.scrollWidth === innerWidth === 768`，案例对话框没有页面级横向溢出。
  - 真实翻译案例 Run 返回“有志者，事竟成。”，`/api/guest/runs` 为 200，额度正确扣减并生成 Run 历史。
  - 天气案例在默认逐步调试模式下正确停在 `weather_report` 结果输入阶段；启用 ReAct 后，线上 `/api/guest/tools/call` 与两个 `/api/guest/runs` 均返回 200，工具返回广州天气 JSON，模型续答生成最终天气与防暑建议，Run 历史记录完整 3 条消息。
  - 线上验收结束时浏览器控制台为 0 错误、0 警告；Models、Quota、Run 与 Tools Call 均为 200。最终截图位于 `.playwright-cli/page-2026-08-12T13-33-30-298Z.png`。
  - 功能提交 `f413847` 已推送；腾讯云发布 `20260812-131315-f4138476f82c` 通过原子切换、Nginx、静态资源、模型目录、工具、MCP、Web Fetch/Search 与远程 MCP 拒绝检查。
  - 25 个游客端聚焦测试通过，包含 9/9 案例可创建、Deep Research 种子、General Agent 工具安全裁剪、Guest Workspace 生命周期及游客 API/工具/MCP；`mise run check:changed`、`mise run build:guest-web` 与 `mise run pack:guest-api` 通过。构建仍输出仓库既有的 top-level await 与大 chunk 容忍警告。
  - 完整仓库测试为 795 通过、1 跳过、25 失败；失败来自本轮未改动的 Windows/POSIX 路径、权限、符号链接、SSH 子进程、生成文件换行同步和缺少 `python3` 的环境基线，不能据此宣称全仓测试全绿。
- 能力边界：游客可从 9 个内置案例创建可编辑、可运行、可持久化的独立 Thread；案例复用桌面 Prompt 数据，但执行工具必须落在 Web 游客真实能力边界内。
- 明确非目标：不提供远程案例市场、账号收藏、动态第三方模板、宿主 Bash、插件子 Agent、自动开启全局 ReAct 或服务端 Thread 同步。
- 可见缺口：尚未增加案例选择/首次 Run 的匿名激活事件；案例执行仍继承当前全局 Run 模式，新访客默认停在逐步工具调试阶段，一键 ReAct 成功仍属于独立的“游客首次成功闭环”能力。

## 游客核心迭代闭环

- 状态：天气 ReAct 完整闭环可用，但默认首次 Run 只完成模型到工具调用的半程；运行历史与评估流程中文化、首次成功引导和产品埋点仍待处理
- 新鲜度：confirmed
- 最后检查：2026-08-12
- 证据：
  - 2026-08-12 在生产环境全新浏览器状态下，根地址正确进入 `#/workbench`，初始额度为 20/20，控制台零错误、零警告；默认天气示例首次点击 Run 后额度变为 19/20，模型正确发起 `weather_report({"location":"广州"})`，但界面停在等待工具结果的空输入框，没有继续生成最终答案。
  - 当前 `packages/ui/src/components/thread-playground/stores/run-mode.ts` 明确让 `autoRunTools` 与 `reactLoop` 默认均为 `false`；对应设置藏在 Run 下拉菜单中，新访客必须先理解并手动启用 ReAct 才能完成一键天气闭环。
  - 游客工作台尚未记录首次访问、首次 Run、工具调用、完整答案、失败、文档打开、运行比较等激活事件；当前只能用受控浏览器路径评估，无法得到真实访客漏斗基线。
  - 使用当前本地提交 `cf5cb8d` 和真实 Chromium 导入包含两个 Run 的受控 Thread，成功打开运行记录、非破坏式 Trace 检查、双 Run 对比和人工评估。
  - 人工选择“Run A Better”并填写中文评估说明后，评估记录写回浏览器本地 Thread；刷新页面后仍可在运行记录中打开，证明现有数据持久化闭环可用。
  - 当前默认示例引导用户查询广州天气，但默认运行模式只走到工具调用；界面也没有告诉用户如何取得最终答案、修改哪一项、再次运行、打开运行记录、检查 Trace 或比较结果。
  - 运行记录入口是标题栏中的无文字历史图标；只有悬停提示，首次用户无法从静态界面理解它承载 Trace、恢复、比较和评估四项核心能力。
  - 运行记录、Trace 检查和评估主流程仍大量使用英文，包括 `Run history`、`Compare Runs`、`Inspect Run`、`Restore`、`Evaluate Runs`、`Rubric` 和评估结论。
  - 游客安全工具闭环已经消除工具空入口；本能力下一轮可直接聚焦默认引导、历史入口可发现性和中文化。
  - ReAct/自动执行设置与四份内置 Skills 已具有真实运行能力；Bash 和 Generator 入口仍需隔离沙箱边界说明。
  - 浏览器审计截图位于 `output/playwright/core-experience-audit/`，包含默认核心界面、运行记录中文化缺口、评估中文化缺口和不可用工具死入口。
  - 本轮未启动游客额度 API，因此浏览器控制台只有两条 `/api/guest/quota` 500 资源错误；核心 Trace/评估交互没有产生应用异常。
  - 2026-08-01 线上版本已把首次示例改为广州天气搜索并预装三个安全工具，根地址直达工作台；7 篇中文说明覆盖 Thread、模型额度、工具/MCP、Auto run/ReAct、错误恢复和浏览器数据边界。
- 能力边界：专家用户或导入已有 Run 的用户可以在浏览器中完成单 Thread 的运行历史查看、快照 Trace 检查、恢复、两次 Run 对比、人工结论和刷新持久化；这些能力共用现有 Thread JSON，不依赖登录或服务端 Thread 存储。
- 明确非目标：本能力本身不新增分享、登录、BYOK、团队协作、批量数据集、自动评审器、Bash、stdio MCP、Generator 或服务端 Thread 同步；游客可执行工具改由独立的“游客安全工具闭环 V1”能力承接。
- 可见缺口：默认示例虽然已经展示工具调用，却不能让新访客一键获得最终答案；“首次完整答案—修改—第二次运行—检查/比较—保存评估”的渐进式闭环缺少界面内引导和可观测漏斗。历史图标可发现性及 Run history、Compare、Inspect、Evaluate 等流程中文化仍待处理。

## Agent 学习导师与页面协作

- 状态：Weather Learning Track V1 已实现，等待提交、腾讯云部署与线上真实浏览器验收
- 新鲜度：confirmed
- 最后检查：2026-08-14
- 证据：
  - 线上全新浏览器首屏同时暴露 Models、Tools、Variables、System prompt、Run settings、Run history、案例与 Threads 等概念；现有“使用说明”会离开当前工作流打开文档，无法解释用户此刻聚焦的元素，也不会根据运行状态主动介入。
  - `GuestWorkbench` 已增加懒加载“学习助手”sidecar；首屏不加载 AG-UI 客户端，打开助手后才加载约 48 KB gzip 的独立 chunk。
  - `HostServices.actions` 已提供打开设置、变量、分享和注册 Run 等少量语义动作，桌面端还有强类型 Command 层；它们证明应扩展语义动作注册表，而不是让模型依赖 DOM 选择器或截图点击。
  - Guest API 已增加独立 `/api/guest/coach` AG-UI SSE 适配：固定概念解释与受控动作不消耗额度，开放问题复用现有模型执行器、并发限制和每日额度。
  - Phase 0 页面上下文只允许 Thread 标题、案例 ID、运行状态、模型 ID、工具数和消息数；不发送完整 Prompt、回答、图片、文件、工具结果或密钥。
  - 页面端只识别注册的 `models`、`tools`、`variables`、`run-settings`、`system-prompt` 语义元素；模型不能提供任意 DOM 选择器、JavaScript 或鼠标键盘动作。
  - Variables 通过现有 HostServices 业务桥打开；Run 通过 AG-UI Interrupt 暂停并要求显式确认，确认后才调用当前工作台注册的 Run 命令。取消分支不消耗工作台 Run。
  - 本地 Chromium 已验证桌面和 390px 窄屏、解释/高亮、Variables、Run 取消与确认、确认后仅消耗一次额度、无横向溢出；证据位于 `output/playwright/agent-learning-copilot-phase0/`。
  - 23 个直接相关测试、changed lint/typecheck、Guest Web 构建和 Guest API 打包通过；全仓 Windows 测试 803 通过、1 跳过、25 个既有平台相关失败，不能宣称全仓测试全绿。
  - 功能提交 `89f23e6` 对应腾讯云发布 `20260813-143211-89f23e6d60f2`；服务 active，Web/API 软链接一致，Nginx 检查通过。
  - 线上全新 Chrome 已验证快捷解释和 Variables 不消耗额度；开放问题真实流式返回非空中文答案且额度 `20/20 → 19/20`；Run 取消不消耗额度，确认后恰好 `19/20 → 18/20` 并生成天气工具调用与 Run history。
  - 线上 390×844 下文档滚动宽高与视口一致，无页面溢出；全部 Coach/Run 网络请求为 200，控制台 0 error / 0 warning。
  - Weather Learning Track V1 新增独立版本化本地状态机与 6 步任务卡，串联 Tool/ReAct、两次真实 Run、天气 Tool trace、修改输入、Run Compare 与结构化复盘；刷新可恢复，暂停/重置不改 Thread。
  - Track 只接收 Run 数量、天气工具调用/完成/待处理数量、输入是否变化、运行状态、历史/Compare 是否打开等内容无关摘要；analytics 白名单不含 Thread ID、Prompt、回答、城市或工具参数/结果。
  - 主动提示仅在用户已开始 Track、步骤边界、页面空闲且无 Dialog 时触发，每会话最多 3 次、至少间隔 90 秒，并提供稍后/暂停。
- 能力边界：Phase 0 按需问答与受控动作继续保留；Weather Track V1 仅能驱动当前天气案例的学习闭环，Run 仍要求 Interrupt 确认，第二次输入必须由用户亲手修改。
- 明确非目标：不让模型直接执行任意 JavaScript、查询任意 DOM 选择器、模拟鼠标键盘、读取原始按键/鼠标轨迹、默认上传完整 Prompt/回答/图片/文件、绕过现有工具权限、自动执行删除/重置/Run 等高影响动作，也不把助手变成全站无边界自治代理。
- 可见缺口：生产北极星“首次 Agent 学习闭环完成率”仍无真实样本基线；需完成本地/线上验收并上线采样。Deep Research Track、跨设备进度、更多语义动作与策略校准仍未实现。CopilotKit React Core 尖峰确认 React 19 可装载，但当前仍保留 `@ag-ui/client` 和自有 UI。

## 游客 Prompt 辅助与多模态输入

- 状态：已提交、推送并部署到腾讯云 Hosted Alpha，线上真实浏览器验收完成
- 新鲜度：confirmed
- 最后检查：2026-08-01
- 当前证据：
  - System Prompt Generate 弹层能够打开，但轻量生成请求缺少游客 API 当前强制要求的工具数组；编辑器又没有展示生成错误，因此提交后表现为无反应。
  - Variables 芯片与 Add 已渲染现有管理界面入口，但 Web Host 的打开与注册动作均为空实现，点击不会触发弹窗。
  - Thread、UI 和核心转换器已有 `image_data` 链路；游客 API 的 128 KB 总请求限制和纯文本校验会在图片到达模型前返回 413。
  - 当前模型目录把三款模型都声明为纯文本；智谱官方资料确认只有 `glm-4.6v` 是本目录中的视觉模型，`glm-4.5-air` 与 `glm-4.7` 不应接受图片。
- 完成证据：
  - Web 工作台现在用同一个游客 Transport 同时承载普通 Thread Run 与 `useStreamText`，System Prompt Generate 不再因 Host Transport 为空而静默失败；生成中按钮、成功提示和错误提示均已补齐。
  - System Prompt 生成把当前工具作为真实模型工具传递，不再把完整工具 Schema 重复塞入文本；生成结果会流式回写编辑器。
  - Web Variables 单槽动作桥已接通芯片、Add 与现有管理弹窗，并处理快速切换时的过期注销。
  - 模型目录与离线回退目录仅把 `glm-4.6v` 标记为 `text + image`；图片仍保存在 Thread 中。后续无阻塞改造取消了上传、粘贴和 Run 前的模型能力拦截：切换到纯文本模型后，浏览器只从当次模型请求副本中剔除图片并附加中文说明，不修改或丢失原 Thread 图片。
  - 浏览器会把大于 700 KB 的 JPG、PNG、WebP 自动缩放并转换为 WebP；客户端限制每个 Thread 5 张，服务端继续校验 MIME、Base64、图片数量、单张 4 MB、合计 6 MB 与总请求 10 MB。
  - 31 个聚焦测试通过；零警告 lint、全仓类型检查、游客 Web 构建和 Guest API 打包通过。
  - 完整仓库测试为 417 通过、1 跳过、6 失败；6 项仍是本轮未改动的 Windows 路径/符号链接、生成文件换行同步和缺少 `python3` 的既有基线，不能据此宣称全仓测试全绿。
  - 功能提交 `f0e4c01` 对应腾讯云发布 `20260801-110957-f0e4c010964f`；systemd 服务为 active，Nginx API 请求体限制为 10 MB，Web 与 API 软链接指向同一发布目录。
  - 本站游客 `/runs` SSE 逐一真实调用 `glm-4.5-air`、`glm-4.7` 与带 Base64 图片的 `glm-4.6v`，3/3 返回 HTTP 200、完整结束事件和非空目标文本，无流式错误。
  - 线上真实 Chromium 完成 Variables 打开、System Prompt 真实生成、文本模型图片提示、切换 GLM-4.6V、上传用户提供的 576 KB 图片和图片问答，目标操作为 3/3，控制台零错误、零警告。
  - 服务端仍会拒绝绕过正常浏览器链路直接向纯文本模型发送二进制图片的异常请求；正常 Web 工作台不会再把图片载荷发送给纯文本模型，因此不会阻断随后的普通文本交流。
  - 线上真实 Chromium 还完成天气 ReAct 闭环：模型调用 `weather_report`、自动取得广州天气 JSON，并在第二个模型回合生成中文天气与出行建议。
  - 密钥未写入仓库、浏览器或测试输出；线上验收截图位于 `output/playwright/guest-prompt-multimodal-v1/online-browser-acceptance.png`、`online-text-model-warning.png` 与 `online-react-weather.png`。
- 本轮目标：System Prompt 生成、Variables 管理、`glm-4.6v` 图片问答三个目标操作首次成功率达到 3/3。
- 安全边界：图片只允许限定 MIME、数量和解码后体积；文本、消息、工具、并发、额度、Origin 和错误脱敏限制继续生效；纯文本模型只接收去除图片后的请求副本，原 Thread 数据继续保留。
- 明确非目标：本能力不是 LangGraph 项目 Generator，不开放宿主文件系统、Bash、stdio MCP、任意文件上传、视频或文档输入，也不改变登录、BYOK、团队和账单范围。

## 游客能力资源真实化与模型切换无阻塞

- 状态：已提交、推送、部署到腾讯云并完成线上真实模型、API 与 Chromium 验收
- 新鲜度：confirmed
- 最后检查：2026-08-01
- 当前证据：
  - 旧 Run 预检扫描整个 Thread，只要历史消息中残留图片，纯文本模型即使收到新的纯文本消息也会被整体阻断。
  - Web Skills 列表此前为空，`skill` Built-in 只返回“尚未开放”的占位结果；游客无法发现、读取或注入真实技能说明。
  - 游客 MCP 仅有包含 `calculator` 与 `current_time` 的演示服务器，设置和文档也将其描述为模拟入口。
  - System Prompt 生成元提示词把默认输出语言写死为英文，中文需求只能影响角色内容，不能约束最终 Prompt 的语言。
- 完成证据：
  - 模型请求新增非破坏式输入适配：视觉模型接收原消息；纯文本模型只接收移除所有 `image_data` 的请求副本，并在相应用户文本后附加“图片未发送”的模型可见说明。原 Thread 图片不被修改，切回视觉模型后仍可继续使用。
  - 上传与粘贴入口不再按当前模型阻止用户操作；普通文本消息也不再被历史图片误伤。服务端仍保留对异常直传图片载荷的最后一道校验。
  - 内置 Skills 提供 `deep-research`、`code-review`、`data-analysis`、`prompt-engineering` 四份可直接读取和注入的中文工作流；设置页新增固定高度 Skills Tab，`available_skills` 变量和 `skill` Built-in 读取同一真实目录。
  - 内置实用工具 MCP 提供 `calculator`、`current_time`、`json_formatter`、`text_statistics`；内置 Web 研究 MCP 提供 `web_search`、`web_fetch`、`weather_report`。七个工具均有真实调用实现，不再返回模拟结果。
  - System Prompt 生成会检测用户输入中的中文、日文、韩文和西里尔文字，并把明确的同语言输出约束与原始需求分区发送给模型；元提示词不再默认英文。
  - 33 个本轮相关聚焦测试通过；全仓类型检查、零警告 lint、游客 Web 构建和 Guest API 打包通过。
  - 完整仓库测试为 426 通过、1 跳过、6 失败；6 项仍来自本轮未改动的 Windows 路径/符号链接、生成文件换行同步和缺少 `python3` 的既有基线，不能据此宣称全仓测试全绿。
  - 功能提交 `2dd89b2` 首次发布为 `20260801-125817-2dd89b2c1a52`；线上真实请求检查发现旧元提示词末尾仍残留默认英文规则，随后由 `af0b6a8` 删除并发布为 `20260801-131526-af0b6a8a407f`。两次发布均通过原子软链接、systemd、Nginx 与 HTTPS 回源检查。
  - 真实 Chromium 在 GLM-4.6V 下添加图片后切换到 GLM-4.5-Air，运行“忽略图片，只用文字回答：你是谁？”成功返回文本；请求体只含文字和“图片未发送”说明，不含图片字节，界面仍保留原图，额度由 20/20 正常变为 19/20。
  - 线上 System Prompt Generate 以中文物理教师和中文历史教师需求各完成一次真实生成，均返回完整中文 Prompt；最终发布的真实请求体包含 `<output-language>简体中文</output-language>`，并明确禁止替换为默认语言，不再含默认英文规则。
  - 线上设置页显示四份 Skills；MCP 管理页显示两组内置 MCP 和完整七工具清单。API 实际发现 4+3 个工具，`json_formatter`、`text_statistics` 与研究 MCP 的 `web_search` 均返回成功结果。天气数据源有一次成功响应后又出现一次上游 500，属于外部数据源瞬时波动，不作为 MCP 路由失败处理。
  - 最终线上 Chromium 的 Models、Quota 与两次 Run 请求均返回 200；1440px 下 `scrollWidth === innerWidth === 1440`，控制台为零错误、零警告。
- 北极星指标：四个目标操作首次成功率由 0/4 提升到线上 4/4：视觉 Thread 切换文本模型后文本 Run、中文生成中文 Prompt、发现并读取 Skills、发现并调用两个内置 MCP。
- 安全边界：不把任意第三方 Skill 代码、远程 MCP、认证头或用户密钥直接引入游客运行时；内置资源为项目自有、可审计的有界实现，所有 Web 工具继续经过现有 SSRF、响应大小、超时、额度和 Origin 防护。
- 明确非目标：本轮不开放任意远程 MCP、stdio MCP、Skill 安装/上传、Skill 脚本执行、OAuth、宿主文件系统或 Bash；Context7 等第三方远程 MCP 只作为市场参照，不直接接入游客后端。
- 可见缺口：内置 Skills 当前是四份静态、版本随发布更新的工作流，没有市场安装、版本锁定或用户自定义；MCP 仍只暴露 Tools，不含 Resources、Prompts、Sampling 或富媒体结果；公共远程 MCP 仍需腾讯云网络层出站限制和独立凭据边界。

## 游客安全工具闭环

- 状态：已部署并通过线上 API、真实 Chromium 与安全边界验收
- 新鲜度：confirmed
- 最后检查：2026-07-30
- 证据：
  - `apps/web/src/host/web-host.ts` 已注入游客 `executeTool`、Built-in/MCP 列表与 `ToolExecutionPolicy`；共享桌面 Host 没有改变默认行为。
  - Built-in 对话框保留原有 File system、Web、Misc 分类，当前分别显示 10、3、3 个工具；`bash` 入口继续明确返回安全边界，`skill` 已接通四份可读取的内置中文工作流。
  - 浏览器虚拟工作区按 Thread ID 隔离，支持 read/write/edit/ls/tree/grep/glob/present_files，拒绝绝对路径、`..`、跨 Thread 越界和超量内容。
  - 服务端 Guest Tool API 提供有界天气、Web Search、Web Fetch 和演示 MCP。腾讯云无法访问原固定 Jina Reader 与 DuckDuckGo Lite 后，网页读取改为“全量 DNS 私网检查、固定解析 IP、逐次重定向复验、标准端口、512 KB 响应上限”的直接读取；搜索改用腾讯云可达的固定搜索入口，仍不接受用户自定义认证头。
  - Guest API 现在接受最多 20 个有界工具 Schema，并支持 Tool Result 作为下一模型回合输入；工具调用另设每日 60 次和单游客并发 1 的内存限制。
  - 原 Demo MCP 已升级为内置实用工具 MCP，提供 `calculator`、`current_time`、`json_formatter`、`text_statistics`；新增内置 Web 研究 MCP，复用受保护的 `web_search`、`web_fetch`、`weather_report`。公共 HTTPS Streamable HTTP 入口继续默认关闭并保留严格地址校验。
  - Custom Function Tool 使用现有 JSON Schema 编辑器；自动模式遇到 Custom 时暂停，用户填写结果后可以继续 ReAct。
  - Web Host 将游客 ReAct 限为最多 6 个模型回合、8 次自动工具调用；低风险读取、搜索、天气和演示 MCP 可自动运行，写入、人工问题和未知远程 MCP 必须确认。
  - 真实 Chromium 已完成 Built-in 列表、虚拟 `read` 自动执行、两回合 ReAct、Demo MCP 计算 `9-4=5`、Custom 人工结果、继续 Run、Run history 与刷新恢复；历史图标和分享占位入口未改。
  - 浏览器验收时发现并修复 Guest API 基路径双斜杠导致的 MCP 404；修复后同一流程成功且刷新未产生新的应用错误。
  - 审计截图与中文验收记录位于 `audits/2026-07-30-130332-guest-safe-tool-loop-v1/`。
  - 21 个聚焦测试全部通过；全仓类型检查和零警告 lint 通过；最新游客 Web 构建与 Guest API 打包通过。
  - 线上独立复验中 `web_fetch`、`web_search`、`weather_report` 和演示 MCP 均返回 200；私网域名、错误 Origin 和公共远程 MCP 分别返回 400、403、403；30 路并发只读请求全部返回 200。
  - 腾讯云部署脚本使用临时目录构建、提交绑定的发布目录、原子软链接切换、服务健康轮询、HTTPS 本机回源验证和完整失败回滚；部署后临时归档与远端脚本会自动清理。
  - 全仓测试为 400 通过、1 跳过、6 失败；失败来自本轮未改动的 Windows 路径、符号链接、生成文件 CRLF 和缺少 `python3` 的既有测试，不能据此宣称全仓测试全绿。
- 已实现边界：
  - 原有入口与图标全部保留，不通过隐藏或删除解决能力缺口；分享按钮本轮继续保持原占位行为，分享实现仍按用户此前决定延期。
  - Built-in Tools V1 提供可真实运行的安全工具：服务器侧受限网络/天气工具、浏览器本地虚拟工作区文件工具、交互工具和有界辅助工具；不得把腾讯云宿主文件系统或进程直接暴露给游客。
  - Custom Function Tool 保持现有定义方式，并打通“模型发起调用—用户填写结果—继续 Run”的人工闭环；不把用户输入的 JavaScript 当作服务端可执行代码。
  - MCP V1 提供同源演示 MCP 和可选的公共 HTTPS Streamable HTTP MCP；游客自定义远程地址必须经过独立代理、SSRF 防护、超时、大小、并发和工具数量限制。stdio、自定义密钥头和 OAuth 留待登录/BYOK 或隔离运行时。
  - 自动工具运行和 ReAct 对明确标记为低风险的工具开放；未知远程 MCP、写入类工具和人工交互工具默认停下等待确认。游客 ReAct 使用独立的低回合/工具调用上限，并按每个模型回合消耗免费额度。
- 明确非目标：本 V1 不开放腾讯云宿主 Bash、宿主文件系统、stdio MCP、任意进程启动、任意私网 URL、自定义 MCP 认证头、OAuth、Generator、技能安装、分享发布、登录或 BYOK。
- 可见缺口：真实智谱模型已完成普通 Run 和 Tool Call 首回合，但工具结果后的模型继续回合受供应商峰值 429 影响，仍需在低峰期补一次完整自动 ReAct 复验或增加备用模型。公共远程 MCP 在线上明确关闭，只有同源演示 MCP 开放；网络层出站策略完成前不得打开。工具额度当前是单进程内存计数，不适合多副本；达到 ReAct 上限的专用可恢复结果条、重复调用检测和总时长上限仍待强化。

## Hosted 多用户 SaaS

- 状态：游客 Alpha 已部署；第一阶段身份与租户基础仍仅在本地验证，尚未接入游客入口
- 新鲜度：confirmed
- 最后检查：2026-07-30
- 证据：
  - The user selected the public multi-user SaaS direction on 2026-07-29.
  - The guest entry flow intentionally bypasses GitHub OAuth and Personal Tenant activation.
  - `apps/server/src/runtime-factory.ts` writes `process.env.LLM_SPACE_HOME`, while `packages/core/src/server/paths.ts` and runtime managers resolve one global settings root.
  - `apps/server/src/auth.ts` accepts one long-lived bearer token and has no user or tenant context.
  - `packages/runtime/src/runtime/model-groups.ts` exposes configured API keys and custom headers; the remote protocol also exposes resolved generator environment values.
  - `packages/runtime/src/tools/built-in/fs.ts` accepts arbitrary absolute paths and can execute Bash; `McpManager` supports stdio commands, cwd, env, and remote secret headers.
  - Planning log `logs/2026-07-29-180322-hosted-multi-user-saas-v1.md` defines the proposed GitHub-login, Personal-Tenant, BYOK, PostgreSQL/RLS, model-only Hosted Alpha.
  - `apps/cloud` now implements GitHub Authorization Code + PKCE, signed short-lived OAuth state, opaque revocable sessions, Personal Tenant/Workspace provisioning, same-origin logout, and a redacted session view.
  - `apps/cloud/migrations/0001_identity_and_tenants.sql` defines the V1 identity/business tables, membership-bound sessions, forced tenant RLS, a fixed-search-path provisioning function, audit events, and runtime-role grants.
  - Cloud startup rejects PostgreSQL `SUPERUSER`/`BYPASSRLS` roles and verifies every tenant table has both RLS and forced RLS.
  - Focused tests cover config, OAuth sealing/tampering/expiry, GitHub protocol, session/cookie/Origin behavior, and client tenant-header spoofing.
  - A current disposable PostgreSQL 16 container test applied the migration from an empty database, rejected a superuser runtime, verified idempotent identity provisioning and session restoration, and proved Tenant A cannot select Tenant B's Workspace.
  - Guest Alpha 提供同源模型 API、不透明游客 Cookie、浏览器/IP 的 HMAC 日额度、输入输出和并发限制，并只开放服务器端已验证的三款智谱模型。
  - Tencent Cloud deployment uses the existing `kandian.site` TLS virtual host, isolated `/llm-space-web/` static/API locations, a hardened systemd service under the `llmspace` account, and a `root:llmspace` mode-640 environment file.
  - Direct production SSE and real-browser model Runs succeeded; the deployed frontend was scanned against the configured secret and was clean.
- Boundary: the public guest deployment is a single-instance Hosted Alpha with browser-local Threads and a platform-funded quota. The PostgreSQL/RLS identity foundation is not yet connected to this surface.
- Explicit non-goals for the current Alpha: GitHub login activation, BYOK, team organizations, invitations, billing, executable host filesystem/Bash tools, stdio MCP, code generation, full mobile UX, production SLA, or compliance claims.
- Visible gaps: authenticated tenant activation; encrypted write-only BYOK; tenant-scoped Thread CRUD and optimistic locking; distributed/idempotent quota accounting; account/workspace deletion execution; KMS, monitoring, backups, alerting, WAF/rate limiting, and operational runbooks. Restoring executable tools additionally requires isolated runtime workers, storage volumes, resource limits, and network policy.

## 游客 Thread 分享

- 状态：桌面端可经 GitHub Gist 分享；游客 Web 只能查看已有共享 Thread，不能创建分享
- 新鲜度：confirmed
- 最后检查：2026-07-30
- 证据：
  - 当前本地提交 `cf5cb8d` 的真实 Chromium 工作台标题栏已显示“Share thread”按钮。
  - 点击该按钮只出现“游客 Thread 分享即将开放。”提示，没有预览、隐私确认、链接生成、复制、更新或撤销流程。
  - `apps/web/src/host/web-host.ts` 明确把游客 `shareThread` 实现为上述占位提示。
  - 当前 `#/shared/gist/threads/mock` 路由可在真实 Chromium 中加载只读共享查看器，展示标题、描述、作者、更新时间和完整 Thread 内容，说明 Web 读取与呈现基础已经存在。
  - 桌面端现有分享通过 GitHub 登录后创建 secret Gist；用户已要求 GitHub 登录延期，因此该写入路径不能直接作为游客 V1。
  - 当前发现证据位于 `.agents/kaizen-loop/audits/2026-07-30-012542-guest-thread-share-discovery/`。
- 能力边界：桌面用户登录 GitHub 后可以把 Thread 发布为任何持有链接者可读的 secret Gist；Web 查看器可以只读展示 Gist Thread。游客 Web 当前只能导入导出 JSON，不能生成浏览器分享链接。
- 明确非目标：当前没有匿名服务端快照、分享链接有效期、游客侧撤销或更新、分享记录管理、内容举报、密码保护、团队权限或搜索发现。
- 可见缺口：工作台已有可见分享入口和可复用查看器，但两端之间没有游客可用的发布协议、隐私确认、受限存储、撤销凭据和滥用防护，按钮目前形成明确的功能断点。

## First-Run Model Setup

- Status: shipped V1
- Freshness: confirmed
- Last checked: 2026-07-03
- Evidence:
  - Current discovery screenshot `audits/2026-07-03-223500-trace-inspector-discovery/01-current-fresh-first-run.png` shows onboarding with a locally detected `OpenAI Codex` provider.
  - Current CEF snapshot showed clicking the detected provider transitions onboarding to `OpenAI Codex is ready` and `Ready to run`.
  - `apps/desktop/src/components/onboard-dialog.tsx` fetches builtin provider discovery and adds detected providers through existing model hooks.
- Boundary: first launch with no configured provider can detect local credentials, add a provider, and reach a runnable model without entering Settings first.
- Explicit non-goals: no real provider connectivity test, no quota/API test run, no setup wizard state machine, no secret display.
- Visible gaps: no real provider connectivity test after setup.

## Workspace And Thread Management

- Status: operational
- Freshness: confirmed
- Last checked: 2026-07-03
- Evidence:
  - Current discovery screenshot `01-current-fresh-first-run.png` shows an empty workspace state with `Start from Example`, `Blank thread`, and `Configure models`.
  - Current CEF fixture check showed both `general-agent` and `trace-fixture` files in the sidebar after reload.
  - `apps/desktop/src/components/file-system-tree-view/use-file-system-tree.ts` creates quick files as local JSON threads.
  - `apps/desktop/src/components/thread-tabs/use-thread-tabs.ts` restores/open tabs and defaults first-run tabs through persisted tab state.
- Boundary: local workspace tree, tabs, rename/move/delete/duplicate/reveal, prompt-example/blank thread creation, and local JSON persistence.
- Explicit non-goals: cloud sync, cross-workspace projects, external file watching beyond current tree refresh behavior.
- Visible gaps: richer workspace project organization remains out of scope; external file writes require reload/refresh to appear.

## Prompt And Thread Building

- Status: manual builder with prompt examples
- Freshness: confirmed
- Last checked: 2026-07-08
- Evidence:
  - Discovery CEF screenshot `audits/2026-07-08-173643-system-prompt-variables/01-current-system-prompt-editor.png` showed the pre-V1 system prompt editor exposed `Generate` and `Examples`, but no Variables entry, variable picker, rendered-preview affordance, date token, or skill selector in the prompt surface.
  - Discovery CEF snapshot on 2026-07-08 showed system prompt editing, model/tool rows, message editing, and run history active with no horizontal overflow before this capability was added.
  - Implementation screenshot `audits/2026-07-08-173643-system-prompt-variables/03-variables-button-thread.png` shows a new `Variables` action beside `Generate` and `Examples`.
  - Implementation screenshot `audits/2026-07-08-173643-system-prompt-variables/04-variables-popover-skills.png` shows current-date format preview and enabled-skill selection/preview inside the variables popover.
  - Implementation screenshot `audits/2026-07-08-173643-system-prompt-variables/05-date-skill-inserted.png` shows date and selected-skill placeholders inserted into the system prompt editor.
  - Runtime resolver check in the live CEF/Vite page resolved `{{llm_space.current_date format="default"}}` and `{{llm_space.skill name="deep-research" format="summary"}}` into concrete prompt text and returned an actionable error for a missing skill.
  - Variable Panel V2 screenshot `audits/2026-07-08-191806-variable-panel-v2/07-v2-skills-markdown-indent.png` shows simple placeholders in the editor while selected skills, `markdown-list` format, and `2 spaces` indentation live in the panel.
  - Variable Panel V2 screenshot `audits/2026-07-08-191806-variable-panel-v2/06-v2-custom-scenario.png` shows custom variable `customer_profile` under active scenario `scenario_2` with a multiline value.
  - Isolated runtime file `workspace/untitled-3.json` persisted `context.variables.available_skills` with `skillNames`, `format`, and `indent`, plus `context.variableVariants` with `baseline` and `scenario_2` value sets.
  - Live CEF resolver checks rendered `{{available_skills}}`, `{{customer_profile}}`, and `{{system_date}}`, and rejected legacy `{{llm_space.current_date format="default"}}`, empty skill selections, and empty custom values with actionable errors.
  - `packages/core/src/thread/prompt-variables.ts` owns date/skill formatting and placeholder semantics; desktop injects enabled local skills through `variable/prompt-variable-skills.ts`.
  - `apps/desktop/src/components/thread-playground/stores/thread-store.ts` now renders variables before `streamThread()` while run snapshots keep the rendered prompt and the live editor keeps the template.
  - Current screenshot `02-starter-thread-current.png` shows `Start from Example` now opens a prompt-example chooser rather than directly creating a single starter thread.
  - Current screenshot `03-example-thread-opened.png` shows a `general-agent` prompt example opened with a populated system prompt, fallback model, and an empty user message.
  - Current CEF discovery screenshot `audits/2026-07-04-175331-next-capability-discovery/01-current-first-run.png` confirms the first-run surface still offers `Start from Example`, `Blank thread`, and `Configure models`.
  - Reliability verification screenshot `audits/2026-07-04-185729-thread-editor-reliability-v1/02-blank-thread-codemirror.png` shows a fresh blank thread open in CEF with real CodeMirror editors rather than a blank app.
  - Reliability verification screenshot `audits/2026-07-04-185729-thread-editor-reliability-v1/05-reload-persisted-editor.png` shows a persisted blank-thread message restored after reload.
  - Reliability verification screenshot `audits/2026-07-04-185729-thread-editor-reliability-v1/06-example-thread-edited.png` shows a prompt example with edited system prompt and user message.
  - `apps/desktop/src/components/start-from-example-dialog.tsx` exposes the chooser.
  - `apps/desktop/src/components/thread-playground/prompt/prompt-examples.ts` defines the available prompt examples and stable file stems.
  - `apps/desktop/src/components/thread-playground/thread-playground.tsx` resolves a fallback model and enables run when a model exists.
- Boundary: user can choose built-in prompt examples or blank threads, manually edit model/tools/system prompt/messages, manage thread-owned prompt variables from a dedicated Variables row below Tools, configure current date and selected skill groups, add default custom variable values, preview formatted values in the Variables dialog, type simple `{{variable_name}}` placeholders into the system prompt, and run with those variables resolved while keeping the stored system prompt as a reusable template.
- Explicit non-goals: multi-file prompt projects, template marketplace, automated prompt optimization.
- Visible gaps: no smart spacing between consecutive inserted placeholders, no dedicated rendered-vs-template diff panel, no full keyboard/screen-reader audit for the variables panel, no guided task setup after choosing an example, and no automated CEF regression smoke for first-thread editing yet.

## System Prompt Variables

- Status: shipped V3 with dedicated Variables row and dialog
- Freshness: confirmed
- Last checked: 2026-07-09
- Evidence:
  - Discovery CEF screenshot `audits/2026-07-08-173643-system-prompt-variables/01-current-system-prompt-editor.png` confirmed the original prompt editor gap: no Variables affordance beside `Generate` and `Examples`.
  - Source inspection confirmed skill discovery and runtime loading already existed through Settings/RPC and the built-in `skill()` tool, so V1 reused existing enabled-skill data instead of introducing a new discovery model.
  - Implementation screenshot `audits/2026-07-08-173643-system-prompt-variables/03-variables-button-thread.png` shows `Variables` in the system prompt toolbar.
  - Implementation screenshot `audits/2026-07-08-173643-system-prompt-variables/04-variables-popover-skills.png` shows date and skill variable formats with previews.
  - Implementation screenshot `audits/2026-07-08-173643-system-prompt-variables/05-date-skill-inserted.png` shows durable date and skill placeholders inserted into the prompt editor.
  - `workspace/untitled.json` in the isolated CEF runtime persisted the placeholder template.
  - Focused resolver checks in the live CEF/Vite page confirmed concrete date/skill rendering and missing-skill errors.
  - V2 screenshot `audits/2026-07-08-191806-variable-panel-v2/07-v2-skills-markdown-indent.png` shows the persistent Variables panel below the editor with `available_skills`, selected `deep-research`, `markdown-list`, and `2 spaces`.
  - V2 screenshot `audits/2026-07-08-191806-variable-panel-v2/06-v2-custom-scenario.png` shows active scenario `scenario_2` and custom multiline variable `customer_profile`.
  - V2 isolated runtime file `workspace/untitled-3.json` persisted `context.variables` and `context.variableVariants`:
    - `available_skills`: `skillNames: ["deep-research"]`, `format: "markdown-list"`, `indent: 2`
    - `system_date`: `type: "currentDate"`, `format: "readable-date"`
    - `variableVariants.active: "scenario_2"` with `baseline` and `scenario_2` value sets.
  - Live CEF resolver checks rendered simple placeholders and returned blocking errors for legacy `llm_space.*` expressions, missing skills, and empty custom values.
  - Layout polish screenshot `audits/2026-07-08-220831-variable-panel-redesign/03-final-skills-detail.png` shows the Variables panel as a resizable section under the system prompt editor with a full-width header divider, compact rows, and a selected-row detail editor.
  - CEF drag verification on port `9333` moved the horizontal resize handle and changed the Variables panel from `243.39px` to `333.39px` without horizontal overflow.
  - Initial relocation screenshot `audits/2026-07-09-101033-variables-tools-entry/02-tools-row-variables-entry.png` showed `Variables` as a compact entry inside the Tools row; UI review corrected this to a separate row.
  - Correction screenshot `audits/2026-07-09-101033-variables-tools-entry/06-variables-separate-row.png` shows a dedicated `Variables` row below `Tools`, with `current_date` and `available_skills` visible as chips plus `Add`.
  - Correction screenshot `audits/2026-07-09-101033-variables-tools-entry/07-variable-chip-opens-detail.png` shows clicking `available_skills` opens the Variables dialog focused on the Skills detail.
  - CEF DOM checks on 2026-07-09 confirmed the row order `Tools` -> `Variables` -> `System prompt`, `documentElement.scrollWidth - innerWidth === 0`, and `0` visible `Insert` buttons.
  - Dialog screenshot `audits/2026-07-09-101033-variables-tools-entry/03-variables-dialog.png` shows the Variables management dialog reusing the variable list and selected-detail layout.
  - Skill-preview screenshot `audits/2026-07-09-101033-variables-tools-entry/05-skills-preview.png` shows the skills detail using `Add` to open skill selection and previewing the selected `deep-research` skill.
  - CEF DOM checks on 2026-07-09 found `0` visible `Insert` buttons in the Variables flow, `documentElement.scrollWidth - innerWidth === 0`, and no relevant console errors.
  - Isolated runtime file `workspace/untitled.json` persisted `context.variables.available_skills.skillNames = ["deep-research"]` and `context.variableVariants.variants.default.custom_variable = ""` after editing through the dialog.
  - Product-design audit notes `audits/2026-07-09-101033-variables-tools-entry/audit-notes.md` found the entry relocation healthy, with keyboard/screen-reader QA as the main remaining risk.
  - TypeScript, lint, diff check, console, and overflow checks passed for the implementation.
- Boundary: users can scan variables directly in a dedicated Variables row below Tools; click a variable chip to open the dialog focused on that variable; use `Add` to open the same dialog for management; rename/configure built-in current-date and skills variables; select an ordered group of enabled skills; choose `xml` or `markdown-list` skills format plus skills-only indentation; add default custom variables; persist all variable config in the thread; type simple `{{variable_name}}` placeholders in the system prompt; and render those variables before the model call. Saved run snapshots preserve the template system prompt rather than replacing it with rendered text.
- Explicit non-goals: no broad templating language, no prompt marketplace, no automatic skill invocation, no secret/env-variable interpolation, no background skill indexing beyond current discovery folders.
- Visible gaps: no direct variable Insert shortcut in the current dialog, no smart whitespace/newline insertion between consecutive placeholders, no rendered-template diff UI, no full accessibility audit beyond DOM labels/screenshot review, and no paid-provider smoke run in this loop.

## Thread Editor Reliability

- Status: shipped V1
- Freshness: confirmed
- Last checked: 2026-07-04
- Evidence:
  - Discovery on port `9351` reproduced the original blank-thread crash and CEF console later identified the root cause as duplicate `@codemirror/state` instances.
  - `apps/desktop/package.json` now declares `@codemirror/language`, `@codemirror/state`, and `@codemirror/view` as explicit desktop dependencies, and `apps/desktop/vite.config.ts` dedupes those identity-sensitive packages.
  - `apps/desktop/src/components/code-editor/extensions.ts` imports `EditorView` and `Extension` from the explicit CodeMirror packages instead of through the `@uiw/react-codemirror` re-export.
  - `apps/desktop/src/components/code-editor/index.tsx` now isolates CodeMirror render failures with a local error boundary and provides a textarea-style fallback with retry.
  - CEF verification on port `9352` with isolated runtime root showed a blank thread with 2 real CodeMirror editors, 0 fallback textareas, a persisted user-message edit in `workspace/untitled.json`, successful reload restore, and an edited `general-agent` example persisted in `workspace/general-agent.json`.
  - Vite's rebuilt dependency cache no longer references `@codemirror/state@6.6.0`, `@codemirror/view@6.43.1`, or `@codemirror/language@6.12.3`; it resolves to `state@6.7.0`, `view@6.43.5`, and `language@6.12.4`.
- Boundary: users need to open blank/example threads, see existing text, type into message/system/tool editors, persist edits, and recover from editor-render failures without losing the rest of the app.
- Explicit non-goals: no full editor replacement, no new thread JSON schema, no analytics/crash-reporting service, no broad CodeMirror redesign.
- Visible gaps: fallback recovery was reviewed in code but not triggered in the happy-path CEF run because the root cause is fixed; no automated CEF regression smoke or crash telemetry yet.

## Run And Streaming

- Status: shipped core loop
- Freshness: confirmed
- Last checked: 2026-07-04
- Evidence:
  - Current screenshots `03-example-thread-opened.png` and `06-restored-run-message-view.png` show `Run` enabled once a fallback model exists.
  - Current discovery screenshot `audits/2026-07-04-110944-core-capability-discovery/03-general-agent-open.png` shows the General Agent example ready to run with model, messages, and tool definitions.
  - `apps/desktop/src/components/thread-playground/stores/thread-store.ts` streams through `streamThread()`, folds reducer events into messages, and records completed runs.
  - `apps/desktop/src/components/thread-tabs/thread-tab-pane.tsx` wires a single Electrobun RPC transport into the active thread.
- Boundary: one thread can run against its selected or fallback model, stream assistant/tool output, abort, and persist completed state.
- Explicit non-goals: batch runs, scheduled runs, provider health validation.
- Visible gaps: live-provider continuation after a real paid/provider tool-call turn still needs a bounded smoke check; the global run control remains generic while the message-level continuation flow is specialized.

## Headless Thread Execution And Evaluation

- Status: shipped V1
- Freshness: confirmed
- Last checked: 2026-07-12
- Evidence:
  - `packages/core/src/types/threads/thread.ts` owns the durable schemas for prompt variables, variable snapshots, run snapshots, evaluation rubrics, scores, and evaluations.
  - `packages/core/src/client/` owns transport-independent streaming, event reduction, conversion, and run eligibility; `packages/core/src/parsers/` owns native/foreign thread parsing and normalization.
  - `packages/core/src/thread/` now owns prompt-variable rendering/snapshot semantics, usage validation/arithmetic/fallback, run-history normalization/recording, and rubric/evaluation persistence rules behind `@llm-space/core/thread`.
  - Desktop imports durable variable behavior directly from core. `variable/prompt-variable-skills.ts` owns enabled local skill discovery, `prompt-variable-options.ts` owns UI labels, and `prompt-variable-display.ts` owns CodeMirror completion/hover presentation; the former mirror façade was deleted. Desktop undo/redo and image-memory policy remain in `stores/thread-history.ts`.
  - `apps/desktop/src/bun/traces/trace-manager.ts` now uses the core usage aggregators instead of a private duplicate implementation.
  - The public-entrypoint headless workflow test materializes prompt variables, records two runs with usage, and persists a structured evaluation without desktop imports; frozen prompt bytes and the missing-skill error contract have focused coverage.
  - All 54 Bun tests, core TypeScript, lint with its one pre-existing warning, and the Vite production build passed on 2026-07-12. Focused tests cover usage compatibility, run caps/fallback IDs, injected-ID collisions, variable normalization, multi-place snapshots, and template-preserving snapshot application. Desktop TypeScript retains the same pre-existing unused `HELLO_WORLD_BUILT_IN_TOOLS` diagnostic.
  - Real Electrobun CEF loaded the existing configured `GPT-5.3 Codex Spark`, materialized a current-date/skills template, and entered the real run path without prompt/RPC/render errors. The provider then failed with `Unable to connect`, so no completed run was available for live persistence inspection; the temporary test thread was removed.
- Boundary: a core-only consumer can materialize a variableized Thread with injected skills/time, apply canonical usage semantics, record and normalize bounded runs, and create/update valid rubrics and evaluations. Desktop supplies local skill discovery and owns UI/session behavior.
- Explicit non-goals: React/Zustand state, CodeMirror completion UI, Electrobun RPC and commands, native menus/windows/updates, desktop analytics, and dynamic third-party plugins do not belong to this capability.
- Visible gaps: core still contains desktop-specific window-state persistence; the new public entrypoint has no real second product consumer beyond desktop and its headless integration test; a successful live-provider run/reload smoke remains pending because the configured provider was unreachable in this loop.

## Token Usage Visibility

- Status: shipped V1
- Freshness: confirmed
- Last checked: 2026-07-05
- Evidence:
  - Current discovery screenshot `audits/2026-07-05-002359-token-usage-discovery/01-current-first-run.png` shows the first-run/product surface is healthy enough to inspect.
  - Current discovery screenshot `audits/2026-07-05-002359-token-usage-discovery/02-example-run-history-no-usage.png` shows the thread editor and Run history panel expose model, messages, and run-history controls, but no token/cost counters or per-step usage summary.
  - `node_modules/@earendil-works/pi-agent-core/dist/agent-loop.js` emits `message_end` with the provider's final assistant message, including `usage`.
  - `node_modules/@earendil-works/pi-ai/dist/types.d.ts` defines provider `Usage` with input, output, cache read/write, reasoning, total tokens, and cost fields.
  - `packages/core/src/client/reducer.ts` now copies non-empty provider usage from `message_end` into the final assistant message.
  - `packages/core/src/types/messages/usage.ts` and `messages.ts` define a backwards-compatible optional assistant-message `usage` field.
  - `packages/core/src/client/converters.ts` preserves saved assistant usage when replaying context to pi.
  - `apps/desktop/src/components/thread-playground/message/token-usage-summary.tsx` renders compact per-step token/cost chips with tooltip breakdowns.
  - `apps/desktop/src/components/thread-playground/token-usage.ts` formats provider usage, aggregates assistant-step usage, and falls back to old snapshot aggregation only when older saved runs lack their own `usage`.
  - Implementation screenshots `audits/2026-07-05-002359-token-usage-visibility-v1/02-token-usage-thread-open.png`, `06-run-history-layout-fixed.png`, `07-run-trace-visible.png`, and `04-token-usage-after-reload.png` show per-step usage, run/trace usage, and reload persistence in the real CEF renderer.
  - Follow-up screenshot `audits/2026-07-05-002359-token-usage-visibility-v1/08-token-usage-header-cache.png` and DOM checks on port `9362` show assistant usage chips in the same header row as `Assistant`, with cache read shown as `cached` and cache write shown as `cache write`.
  - Review-fix screenshots `audits/2026-07-05-002359-token-usage-visibility-v1/10-review-fix-run-history-open.png` and `11-review-fix-run-trace.png`, plus DOM checks on port `9363`, confirm Run history and trace headers use saved-run `usage` deltas (`210 tok ...`) rather than cumulative thread totals, include input/output/reasoning/cache/cost, omit `Cache Write 1h`, and keep `documentElement.scrollWidth === innerWidth` at 1280px.
- Boundary: users can see and retain provider-reported token/cost/cache consumption per assistant/model step, per saved run, and inside the saved-run trace inspector. Per-run displays use the run's own usage delta when available, with best-effort old-file fallback to snapshot aggregation. Per-step usage appears in the assistant message header row. Missing or all-zero provider usage is intentionally omitted from the main editor.
- Explicit non-goals: no provider billing reconciliation, quota enforcement, usage dashboard across workspaces, token estimation before sending, alerts/budgets, or non-LLM tool runtime cost model.
- Visible gaps: no global usage dashboard, no context-window preflight, no evaluation cost-diff UI, no live paid-provider smoke in this loop, and no full keyboard/screen-reader audit of tooltip details yet.

## Tool Step Orchestration

- Status: shipped V1 manual loop
- Freshness: confirmed
- Last checked: 2026-07-04
- Evidence:
  - Current discovery screenshot `audits/2026-07-04-110944-core-capability-discovery/03-general-agent-open.png` shows the General Agent example ships with tool definitions such as `web_search`, `web_fetch`, `bash`, `read`, `write`, and `edit`.
  - Current fixture screenshot `audits/2026-07-04-110944-core-capability-discovery/04-tool-step-fixture-after-run.png` shows a thread with an assistant tool call and editable `Response` field, but no product-level pending-tool state or explicit `Continue` action tied to completed tool outputs.
  - Current discovery screenshot `audits/2026-07-04-224500-different-feature-discovery/04-tool-step-response-filled.png` shows a real CEF thread with a pending `web_search` tool call, a manually filled `Response`, and no visible `Continue`/pending-tool workflow beyond generic run controls.
  - Current CEF button/text inspection on 2026-07-04 showed `Run from this message` remains available on the assistant tool-call message, while no `Continue`, `Approve`, `Reject`, or all-tools-ready state appears after the tool response is supplied.
  - `packages/core/src/server/agent/stream.ts` converts all configured tools into step-by-step agent tools whose `execute()` returns an empty text result and `terminate: true`, so the app intentionally stops at tool calls rather than executing web, shell, or filesystem operations.
  - `packages/core/src/client/converters.ts` can lower assistant `toolCalls` plus their outputs into pi `toolResult` messages, so the underlying continuation path exists once a tool output is filled.
  - Manual Tool Continuation V1 screenshots `audits/2026-07-04-231420-manual-tool-continuation-v1/01-pending-needs-response.png`, `02-ready-continue-enabled.png`, `04-multi-one-missing.png`, and `05-error-result-ready.png` show pending, ready, multi-tool, and error-result continuation states in the real CEF renderer.
  - `apps/desktop/src/components/thread-playground/message/tool-call-status.ts` derives pending/ready/error summary state from existing `toolCall.output` data without changing the thread schema.
  - `apps/desktop/src/components/thread-playground/message/message-list-item.tsx` shows `Waiting for Tools` / `Tool Results Ready` and a message-level `Continue` CTA that calls the existing `run(message.id)` path.
  - `apps/desktop/src/components/thread-playground/message/tool-call-list-item.tsx` lets users mark or clear error results with the existing `isError` flag and keeps Cmd+Enter continuation gated until all tool calls have text output.
- Boundary: users can define tool schemas, receive model tool calls as assistant messages, manually edit tool-call outputs, mark failed/rejected results as error text, see all-tools-ready status, and continue from the assistant tool-call message once every visible tool call has output.
- Explicit non-goals: no automatic web/search/shell/filesystem execution, no MCP runtime, no permission system, no background tool queue, no multi-agent runtime orchestration.
- Visible gaps: live paid/provider continuation was not exercised in this loop; no automatic local execution sandbox, permission system, background queue, or rich multi-step trace timeline; error marking is a compact text toggle rather than a dedicated reject dialog.

## MCP Server Integration

- Status: shipped V1
- Freshness: confirmed
- Last checked: 2026-07-04
- Evidence:
  - Implementation screenshot `audits/2026-07-04-122756-mcp-integration-v1/01-settings-mcp-empty.png` shows Settings now has an `MCP` page and empty server state.
  - Implementation screenshot `audits/2026-07-04-122756-mcp-integration-v1/02-settings-mcp-fixture-tools.png` shows a configured stdio fixture server tested through Settings with one discovered tool, `mcp__fixture__echo`.
  - Implementation screenshot `audits/2026-07-04-122756-mcp-integration-v1/03-thread-mcp-tool-added.png` shows the thread Tools area can add `mcp__fixture__echo` from the configured MCP server.
  - Implementation screenshot `audits/2026-07-04-122756-mcp-integration-v1/04-call-mcp-tool-result.png` shows an assistant MCP tool call exposes `Call MCP Tool` and fills the response with `fixture:cef`.
  - `apps/desktop/src/bun/mcp/mcp-manager.ts` persists `settings/mcp.json`, manages MCP clients in the Bun process, supports `StdioClientTransport`, `StreamableHTTPClientTransport`, and `SSEClientTransport`, lists tools, calls tools, normalizes direct names, and flattens tool results to text.
  - `apps/desktop/src/shared/rpc.ts` and `apps/desktop/src/bun/rpc/index.ts` expose typed MCP server/tool/call requests across the renderer/Bun boundary.
  - `packages/core/src/types/tools/index.ts` stores optional MCP provenance on function tools while preserving plain function tools.
  - Manager fixture verification discovered `mcp__fixture__echo` and returned `fixture:ok`; rendered CEF verification returned `fixture:cef`.
  - Readiness audit screenshot `audits/2026-07-04-151659-mcp-tool-readiness-v1/01-settings-ready-tools-current.png` shows Settings > MCP presenting Ready status, tool count, tested time, and live-session connection state after an explicit Test.
  - Readiness audit screenshot `audits/2026-07-04-151659-mcp-tool-readiness-v1/02-after-restart-last-test-current.png` shows the last tested status and tool summaries persist after an app restart without automatically reconnecting the MCP server.
  - Readiness audit screenshot `audits/2026-07-04-151659-mcp-tool-readiness-v1/03-add-mcp-readiness-popover-current.png` shows the thread `Add MCP` popover using persisted readiness/tool summaries with an explicit refresh and `Open Settings` path.
  - Readiness audit screenshot `audits/2026-07-04-151659-mcp-tool-readiness-v1/04-error-state-current.png` shows a readable failed readiness state for a missing environment variable.
  - `apps/desktop/src/bun/mcp/mcp-manager.ts` persists readiness snapshots in `settings/mcp.json`, including status, tested time, redacted latest error, tool count, and compact tool summaries.
  - Current discovery screenshot `audits/2026-07-04-202128-remote-mcp-diagnostics-discovery/03-settings-mcp-remote-form.png` confirms the MCP settings form exposes Streamable HTTP URL and headers.
  - Current discovery screenshot `audits/2026-07-04-202128-remote-mcp-diagnostics-discovery/04-remote-connection-error.png` shows an unreachable Streamable HTTP endpoint reports a generic connectivity error.
  - Current discovery screenshot `audits/2026-07-04-202128-remote-mcp-diagnostics-discovery/05-add-mcp-error-popover.png` shows the thread Add MCP popover carries the persisted remote error and retry/open-settings paths.
  - Remote diagnostics implementation screenshots `audits/2026-07-04-211429-remote-mcp-diagnostics-v1/01-settings-remote-success-diagnostics.png`, `02-settings-remote-auth-diagnostics.png`, and `03-settings-remote-env-diagnostics.png` show successful, unauthorized, and missing-env Streamable HTTP tests with redacted diagnostic timelines.
  - Remote diagnostics implementation screenshot `audits/2026-07-04-211429-remote-mcp-diagnostics-v1/04-add-mcp-diagnostic-headline.png` shows the thread Add MCP popover surfacing the latest diagnostic headline and Settings path.
- Boundary: users can configure MCP servers in local settings, with stdio, Streamable HTTP, or SSE transport fields; discover MCP tools; inspect persisted readiness status, last-known tool summaries, and latest redacted diagnostic timeline; explicitly refresh/test a server; copy a safe diagnostic summary; explicitly add selected tools to a thread as `mcp__{server_name}__{tool_name}` direct tools; and explicitly execute visible assistant MCP tool calls after a click, writing flattened text output into the existing tool-response field.
- Explicit non-goals: no full built-in OAuth authorization-code callback, token refresh, revoke, or account-management flow; no resources browser; no prompts browser; no sampling, elicitation, or tasks; no automatic MCP execution during agent streaming; no MCP registry browsing; no global permission policy beyond explicit per-call user action.
- Visible gaps: real third-party authenticated remote MCP services remain unaudited; full OAuth lifecycle is intentionally out of scope; readiness stores a last-known snapshot rather than a background health monitor; MCP outputs are flattened to text rather than preserving rich resource/blob payloads; threads must add MCP tools explicitly one by one; direct tool names are disabled rather than auto-suffixed when normalized MCP tool names collide. Resources/prompts are an intentional near-term non-goal because expected usage is low for the current product stage.

## Remote MCP Diagnostics

- Status: shipped V1
- Freshness: confirmed
- Last checked: 2026-07-04
- Evidence:
  - Current discovery screenshot `audits/2026-07-04-202128-remote-mcp-diagnostics-discovery/03-settings-mcp-remote-form.png` shows Streamable HTTP configuration is possible with URL and headers.
  - Current discovery screenshot `audits/2026-07-04-202128-remote-mcp-diagnostics-discovery/04-remote-connection-error.png` shows an unreachable remote endpoint collapses to `Unable to connect. Is the computer able to access the url?`.
  - Current discovery screenshot `audits/2026-07-04-202128-remote-mcp-diagnostics-discovery/05-add-mcp-error-popover.png` shows the same remote failure is visible from the thread Add MCP popover, but without a transport-specific diagnosis.
  - `apps/desktop/src/bun/mcp/mcp-manager.ts` supports Streamable HTTP and SSE transports through the MCP SDK, resolves env/header values, redacts sensitive text, and persists readiness snapshots.
  - `apps/desktop/src/bun/mcp/mcp-manager.ts` now captures compact diagnostics around config validation, secret/env/header resolution, transport open, MCP initialize, and list-tools phases.
  - `apps/desktop/src/components/settings/mcp-page.tsx` now renders the latest diagnostic timeline and copy summary action under readiness.
  - `apps/desktop/src/components/thread-playground/tool/mcp-tool-import-popover.tsx` now surfaces the latest diagnostic headline and routes full details to Settings.
  - Implementation screenshots `audits/2026-07-04-211429-remote-mcp-diagnostics-v1/01-settings-remote-success-diagnostics.png`, `02-settings-remote-auth-diagnostics.png`, `03-settings-remote-env-diagnostics.png`, and `04-add-mcp-diagnostic-headline.png` verify success, auth failure, missing-env failure, and Add MCP handoff states at 1280x800.
  - Persisted-summary verification in the implementation loop confirmed diagnostic summaries omit query strings, bearer/header values, and fixture secret values while preserving endpoint origin and path.
  - Post-review fixture verification covers Streamable HTTP success, 401/403 auth, missing env/header, SSE success, malformed protocol response, 404 transport mismatch, timeout, and a stdio control case with no diagnostic rendered.
- Boundary: users can enter remote MCP URL/header settings, run a connection test, see whether the latest failure came from config, secret resolution, transport/auth/HTTP/protocol, initialization, list-tools, or final result, copy a redacted diagnostic summary, and open Settings from the thread Add MCP popover for full details.
- Explicit non-goals: no full OAuth authorization-code callback, no token refresh/revoke/account lifecycle, no MCP resources/prompts, no registry browsing, no automatic execution, no background monitor.
- Visible gaps: no real third-party authenticated remote MCP service audit; no full OAuth authorization-code lifecycle; no background health history beyond latest readiness/diagnostic snapshot; no raw request/response protocol inspector.

## MCP Context Primitives

- Status: deferred/non-goal for current stage
- Freshness: confirmed
- Last checked: 2026-07-04
- Evidence:
  - Current discovery screenshot `audits/2026-07-04-142708-mcp-next-discovery/01-settings-mcp-empty.png` shows the Settings > MCP surface has server management only; no resources or prompts section is present.
  - Current discovery screenshots `audits/2026-07-04-142708-mcp-next-discovery/02-blank-thread-add-mcp-entry.png` and `03-add-mcp-no-servers.png` show the thread-level MCP entry is scoped to adding MCP tools, not browsing or inserting context/prompt primitives.
  - `apps/desktop/src/bun/mcp/mcp-manager.ts` currently implements `listTools()` and `callTool()` but no `listResources()`, `readResource()`, `listPrompts()`, or `getPrompt()` path.
  - `apps/desktop/src/shared/rpc.ts` exposes MCP server CRUD, tool listing, and tool calls only.
  - `apps/desktop/node_modules/@modelcontextprotocol/sdk/README.md` confirms the installed SDK exposes high-level client helpers for tools, resources, and prompts.
- Boundary: users cannot discover MCP resources, read text resources, discover MCP prompt templates, provide prompt arguments, preview prompt messages, or insert MCP-provided context into a thread.
- Explicit non-goals: no automatic context inclusion, no resource subscriptions/templates, no binary/resource gallery, no MCP sampling, elicitation, tasks, apps, or full OAuth account lifecycle.
- Visible gaps: all user-facing resource and prompt flows are absent, but this is no longer treated as the next priority. Product decision on 2026-07-04: keep MCP tool-only for now because resources/prompts exist in the protocol but appear rarely used in practice.

## Skill Discovery And Runtime Loading

- Status: partially shipped, evidence-limited
- Freshness: unknown
- Last checked: 2026-07-08
- Evidence:
  - Source inspection on 2026-07-08 found `apps/desktop/src/components/settings/skills-page.tsx` exposes a Settings > Skills page with discovery folders, per-skill enable switches, bulk enable/disable, and folder removal confirmation.
  - Source inspection found `apps/desktop/src/bun/skills/skills-manager.ts` persists `settings/skills.json`, seeds default discovery folders, validates `SKILL.md` frontmatter, resolves enabled skills by name, and reads selected skill content for runtime use.
  - Source inspection found `apps/desktop/src/bun/skills/seed.ts` seeds a bundled `deep-research` skill under the app data root on fresh installs.
  - Source inspection found `apps/desktop/src/components/thread-playground/examples/prompts.ts` injects enabled skills into the General Agent starter thread's `<available-skills>` reminder.
  - Source inspection found `apps/desktop/src/bun/tools/built-in/fs.ts` implements the runtime `skill()` tool and returns the selected skill base directory plus `SKILL.md` body.
  - Current CEF/CDP product-surface verification was attempted with an isolated `LLM_SPACE_HOME` on port `9381`, but Electrobun stayed in the CEF dependency download path and never exposed CDP during this loop.
- Boundary: source evidence indicates users can configure local skill discovery folders, enable or hide discovered skills, seed a bundled Deep Research skill, expose enabled skills in the General Agent starter context, and load skill instructions at runtime through `skill(name)`.
- Explicit non-goals: no skill creation/editing UI, no runtime skill preview/test call from Settings, no skill provenance panel inside threads, no conflict resolution for duplicate names beyond first-folder-wins, no packaged skill registry/marketplace.
- Visible gaps: rendered flow is unconfirmed in this loop; users likely cannot test from Settings that a skill can be loaded by a thread, see which skills a particular thread captured, or diagnose duplicate/invalid skills without source-level knowledge.

## Bundled Extension Authoring

- Status: shipped internal V1 for trusted bundled tool modules
- Freshness: confirmed
- Last checked: 2026-07-11
- Evidence:
  - `apps/desktop/src/bun/app/start-desktop-app.ts` is the production composition root and constructs process-scoped model, MCP, search, skills, trace, analytics, storage, streaming, updater, RPC, and window dependencies explicitly.
  - `apps/desktop/src/bun/host/desktop-host.ts` registers bundled modules before RPC/window creation, freezes contributions, reports module-context startup failures, and performs reverse-order best-effort cleanup.
  - `apps/desktop/src/bun/tools/tool-registry.ts` snapshots and freezes `ToolContribution` definitions, rejects duplicate ids/names, lists tools, and dispatches calls through the unchanged RPC contract.
  - `apps/desktop/src/bun/tools/built-in/built-in-tools-module.ts` is the reference bundled module. Filesystem and web tool factories receive only declared workspace, skill, search, and environment dependencies.
  - `apps/desktop/src/bun/app/shutdown-coordinator.ts` synchronously cancels the first Electrobun quit, awaits idempotent runtime cleanup, and permits the second quit.
  - Final verification on 2026-07-11: `bun test` passed 42/42; core TypeScript and Vite production build passed; lint had only the existing `HELLO_WORLD_BUILT_IN_TOOLS` warning; desktop TypeScript had only the matching existing unused-variable diagnostic.
  - Real CEF verification on port 9341 returned all 16 original tool names in order, called `todo_write` with `{ contentText: "OK" }`, reported zero horizontal overflow, and showed no relevant console errors.
- Boundary: a core-team author can add a trusted, compile-time bundled Bun module that contributes built-in tools, receives explicit narrow dependencies, fails startup with module context, and participates in deterministic lifecycle. The registry is permanently frozen before RPC/window creation; existing renderer, RPC, persistence, and tool behavior stay unchanged.
- Explicit non-goals: no public plugin SDK, third-party or runtime package loading, manifests, marketplace, dynamic enable/disable, hot reload, sandboxing, permissions, compatibility negotiation, renderer/UI contribution points, or contribution types beyond built-in tools.
- Visible gaps: no plugin discovery or user management surface; no isolation or trust model; no compatibility/version contract; additional contribution seams should be added only after a concrete product use case proves them necessary.

## Debug Timeline

- Status: shipped V1 with inspection entry points
- Freshness: confirmed
- Last checked: 2026-07-03
- Evidence:
  - Current screenshot `04-trace-fixture-run-history.png` shows two durable run snapshots listed in the Run history panel.
  - Current screenshot `06-restored-run-message-view.png` shows restoring a run displays assistant thinking and tool call outputs in the main message editor.
  - Implementation audit screenshot `audits/2026-07-03-225143-trace-inspector-v1/02-run-history-open.png` shows run-history rows with compare, inspect, and restore actions visible inside the right panel at 1280x800.
  - `apps/desktop/src/components/thread-playground/run-history-list-view.tsx` renders run history, inspect controls, restore controls, removal, comparison selection, and saved evaluation cards.
- Boundary: recent completed runs are recorded per thread, listed in the Run history panel, inspectable without mutation, and restorable into the editor when the user intentionally wants an editable snapshot.
- Explicit non-goals: full raw trace event persistence, step-through trace inspector, global run database.
- Visible gaps: restore still intentionally mutates the working thread; raw event timing and step-through playback remain out of scope.

## Evaluation Workspace

- Status: shipped V2 with Structured Evaluation Rubrics V1
- Freshness: confirmed
- Last checked: 2026-07-10
- Evidence:
  - Current CEF screenshot `audits/2026-07-10-145713-evaluation-rubrics-discovery/01-current-run-history.png` shows two durable run cards, comparison selection, inspect/restore actions, and one saved evaluation in the 1280x800 desktop renderer.
  - Current CEF screenshot `audits/2026-07-10-145713-evaluation-rubrics-discovery/02-current-evaluation-dialog.png` shows the comparison dialog with Run A/Run B evidence, five fixed overall verdicts, and one unstructured evaluation note; there is no criterion/rubric configuration or per-side structured score.
  - Current CDP checks on 2026-07-10 found `documentElement.scrollWidth === innerWidth === 1280`, a 1040x728 evaluation dialog inside the 1280x800 viewport, and no relevant console errors.
  - Current screenshot `04-trace-fixture-run-history.png` shows a saved evaluation card for two runs.
  - Current screenshot `05-current-evaluation-dialog.png` shows the evaluation dialog comparing two run snapshots with model/message metadata, system prompt, last user message, result text, tool inputs, and tool outputs.
  - Implementation audit screenshots `04-evaluation-dialog-with-inspect.png` and `06-inspector-inside-evaluation.png` show each comparison side can open a read-only inspector inside the saved evaluation dialog without stacking a second modal.
  - Structured-rubric screenshot `audits/2026-07-10-154419-structured-evaluation-rubrics-v1/05-six-criterion-editor.png` shows the same-dialog editor at the maximum six-criterion boundary.
  - Structured-rubric screenshot `audits/2026-07-10-154419-structured-evaluation-rubrics-v1/06-six-criterion-scorecard.png` shows complete 1-5 scores for both runs and the derived aggregate summary.
  - Structured-rubric screenshot `audits/2026-07-10-154419-structured-evaluation-rubrics-v1/07-reversed-six-criterion-scorecard.png` shows the same run-keyed scores with A/B orientation reversed and a correctly flipped directional verdict/delta.
  - Structured-rubric screenshot `audits/2026-07-10-154419-structured-evaluation-rubrics-v1/08-saved-snapshot-after-revision.png` shows the immutable saved v1 snapshot remaining selectable beside the edited v2 definition.
  - Structured-rubric screenshot `audits/2026-07-10-154419-structured-evaluation-rubrics-v1/09-delete-confirmation.png` documents the destructive-action guard and explains that historical snapshots survive definition deletion.
  - Structured-rubric screenshot `audits/2026-07-10-154419-structured-evaluation-rubrics-v1/10-narrow-scorecard.png` plus CDP geometry checks confirm a 700x700 viewport has no document or dialog horizontal overflow.
  - The isolated persisted Thread JSON retained one six-criterion rubric snapshot and twelve scores keyed by the two stable run IDs after save, reload, definition revision, and definition deletion.
  - Real CDP keyboard smoke confirmed roving radio focus and ArrowRight/ArrowDown, ArrowLeft/ArrowUp, Home, End, Space, and Tab behavior; the final renderer console contained no errors.
  - Twenty-four focused Bun tests cover schema bounds, malformed/duplicate normalization, rubric CRUD/revisions/caps, immutable snapshots, unordered run-pair orientation, score completeness/aggregation, cross-rubric isolation, and saved-snapshot score restoration.
  - `packages/core/src/types/threads/thread.ts` models legacy and structured evaluations as a compatible union with bounded rubric/snapshot/score data.
  - `apps/desktop/src/components/thread-playground/run-evaluation-dialog.tsx`, `run-evaluation-scorecard.tsx`, and `evaluation-rubric-editor.tsx` implement the comparison, scoring, and rubric-management surfaces.
- Boundary: two durable runs in one thread can be compared and inspected, labeled with the existing overall verdict/note, or scored against a reusable thread-owned rubric with 2-6 ordered criteria and complete integer 1-5 scores. One evaluation per unordered pair persists immutable rubric evidence, per-run scores, unweighted averages, and B-minus-A delta; editing or deleting the reusable definition does not alter history, and legacy verdict-only evaluations remain valid.
- Explicit non-goals: dataset/experiment runner, automated or model judge, weighted/formula criteria, thresholds, global rubric library, multiple evaluations per run pair, CI/export, cloud sync, evaluation telemetry, and raw side-by-side trace diff.
- Visible gaps: rubric weights and mixed criterion types, reusable cross-thread libraries, aggregate experiment tables, evaluation cost comparison, dataset execution, automated judges, and side-by-side trace/timing diff remain unimplemented. The 80% rubric-backed completion target still needs a ten-comparison maintainer dogfood set after merge.

## Trace Inspection

- Status: shipped V1
- Freshness: confirmed
- Last checked: 2026-07-03
- Evidence:
  - README promises Trace as a top-level product capability.
  - Current screenshot `05-current-evaluation-dialog.png` shows evaluation can display compact tool input/output text, but not thinking or a chronological evidence path.
  - Current screenshot `06-restored-run-message-view.png` shows the main editor can display assistant thinking and tool call outputs only after a run is restored.
  - Implementation audit screenshot `03-inspector-from-run-history.png` shows a read-only run inspector opened from Run history with system prompt, last user message, assistant result, thinking, and ordered tool calls.
  - Implementation audit screenshot `06-inspector-inside-evaluation.png` shows the same inspector opened from a saved evaluation run side inside one dialog layer, including a clear `No thinking captured` empty state.
  - `apps/desktop/src/components/thread-playground/run-trace-dialog.tsx` renders the inspector from existing `RunSnapshot` data.
  - `apps/desktop/src/components/thread-playground/run-history-list-view.tsx` and `apps/desktop/src/components/thread-playground/run-evaluation-dialog.tsx` wire the inspect actions.
  - `packages/core/src/client/reducer.ts` reduces stream events into final assistant messages with `thinking` and `toolCalls`, but raw event timings are not persisted.
  - `packages/core/src/types/threads/thread.ts` persists run snapshots as reduced thread snapshots, not raw event timelines.
- Boundary: users can inspect reduced saved-run evidence non-destructively from Run history or either side of an Evaluation dialog, including prompt, last user message, final assistant result, thinking, tool inputs, and tool outputs.
- Explicit non-goals: raw token/event timeline, per-step latency, global trace database, side-by-side step diff, automated diagnosis.
- Visible gaps: V1 is limited to reduced run snapshots; it does not preserve exact event timing, token deltas, intermediate stream chronology, or cross-run trace diffs.

## External Trace Import

- Status: shipped V1
- Freshness: confirmed
- Last checked: 2026-07-06
- Evidence:
  - Current discovery screenshot `audits/2026-07-05-160904-langfuse-trace-import-discovery/01-current-native-debug-surface.png` shows the product can render a native reduced debug fixture with assistant thinking, tool calls, token usage, manual continuation state, and Run history.
  - Current discovery screenshot `audits/2026-07-05-160904-langfuse-trace-import-discovery/02-current-run-trace-inspector.png` shows the saved-run trace inspector can render a local `ThreadRunSnapshot` as a non-mutating debug view with usage and step evidence.
  - Current discovery screenshot `audits/2026-07-05-160904-langfuse-trace-import-discovery/03-raw-langfuse-opens-empty.png` shows a Langfuse-observation-shaped JSON file opens as an empty thread with no run history, losing the observation rows for debugging.
  - Implementation screenshot `audits/2026-07-05-160904-langfuse-trace-import-v1/03-final-cef-trace-debug.png` shows the new `Files | Traces` sidebar, a manual Langfuse Trace Project, an imported `llm-call` trace row, and the trace opened directly in a reused `ThreadPlayground` debug workbench.
  - CEF verification on port `9367` with isolated runtime root created a Trace Project, imported the supported Langfuse Observations JSON fixture, opened the trace tab, displayed user/assistant messages, usage (`98 in / 68 out`), a `web_search` tool call/result, and a compact `Langfuse · Manual Import · trace trace-1` context header.
  - The same CEF run confirmed the tab-bar `New blank thread` command still creates and opens `workspace/untitled.json` while the sidebar is in `Traces` mode.
  - Storage verification under the isolated root showed trace-owned files at `traces/projects/{project_id}/traces/llm-call-17fe6f3033/raw.json`, `trace.json`, and lazy-created `workbench.json`, with no `workspace/` thread created by the trace import path.
  - `apps/desktop/src/bun/traces/trace-manager.ts` owns trace-project storage and best-effort Langfuse JSON normalization for `{ data: [...] }` and bare observation arrays.
  - `apps/desktop/src/components/trace-panel/trace-panel.tsx` provides the independent Trace Panel with project creation, selected-project import, and trace rows.
  - `apps/desktop/src/components/thread-tabs/use-thread-tabs.ts` and `trace-tab-pane.tsx` add typed trace tabs backed by trace-owned `workbench.json`.
  - `apps/desktop/src/lib/import-threads.ts` and `packages/core/src/parsers/thread-parser-registry.ts` only route `.json` files through the generic JSON thread parser.
  - `packages/core/src/parsers/json-thread-parser.ts` accepts any non-foreign JSON that satisfies the optional-field `Thread` schema; a Langfuse observations payload with top-level `data` can therefore be written as a native-looking but empty thread instead of being rejected or normalized.
  - `packages/core/src/parsers/normalize-thread.ts` normalizes OpenAI/Anthropic chat-like `messages`, tools, images, tool calls, and tool results, but has no Langfuse trace/observation normalization path.
  - External Langfuse docs reviewed on 2026-07-05 say Langfuse traces are containers of observations, Observations API v2 returns row-level spans/generations/events, and UI/Blob exports can produce JSON/JSONL data that includes observations and trace context.
  - Protocol repair on 2026-07-06 checked the current Langfuse OpenAPI: v2 observations expose field groups including `io`, but input/output are always raw strings and `parseIoAsJson=true` is deprecated and returns 400. `TraceManager` now decodes JSON-shaped raw strings locally when creating the workbench and repairs existing workbench text wrappers such as `{"content":"..."}` on read.
- Boundary: users can create local Trace Projects, manually import supported Langfuse JSON (`{ data: [...] }` or bare observation arrays) into the selected project, list imported traces in the dedicated Trace Panel, and open each trace directly as a trace tab that reuses `ThreadPlayground` over a lazy-created trace-owned `workbench.json`. Langfuse raw-string IO is normalized into user/assistant/tool text where it clearly wraps message content.
- Explicit non-goals: no live Langfuse sync, no automatic connect UI, no JSONL in V1, no write-back to Langfuse, no account-management flow, no OTLP collector, no full read-only trace timeline UI, no Trace/Debug/Runs detail tabs in V1, and no mixing trace-owned workbenches into `workspace/`.
- Visible gaps: no background sync, no JSONL import, no full raw trace timeline, no import preview, no delete/rename/credential-rotation project management, no schema-specific coverage for every Langfuse export variant, and no global trace search.

## Langfuse Connected Trace Source

- Status: shipped V1
- Freshness: confirmed
- Last checked: 2026-07-06
- Evidence:
  - Pre-implementation CEF discovery screenshot `audits/2026-07-05-221840-langfuse-connect-v1/01-current-trace-panel-empty.png` showed the Trace Panel empty state only supported creating a local Trace Project and manually importing Langfuse JSON; there was no connect/test/sync entry.
  - Pre-implementation CEF snapshot on 2026-07-05 showed the Trace Panel toolbar actions were `New Trace Project` and `Import Langfuse Export`; there was no API credential path.
  - `.env` at the repo root contains `LANGFUSE_BASE_URL`, `LANGFUSE_PUBLIC_KEY`, and `LANGFUSE_SECRET_KEY`; discovery checked names/presence only and did not log secret values.
  - A redacted API smoke against the configured Langfuse host returned `200` for `GET /api/public/projects` and found one accessible project, proving the provided keys can read the project-scoped API.
  - A redacted API smoke against `GET /api/public/v2/observations?limit=3&fields=core,basic,time,io,model,usage,trace_context,metrics` returned observation rows with trace ids, project ids, input/output, model, usage, cost, and trace context fields that match the existing manual-import normalizer inputs.
  - `apps/desktop/src/shared/traces.ts` already reserves `TraceProjectSource` mode `connected`, but it does not persist credentials, sync status, or imported-at cursors.
  - `apps/desktop/src/bun/traces/trace-manager.ts` imports already-read JSON files only; it has no Langfuse HTTP client, credential storage, API pagination, or source test method.
  - `apps/desktop/src/components/trace-panel/trace-panel.tsx` has local project creation/import UI only and no connect form or sync action.
  - Langfuse OpenAPI on 2026-07-05 declares Basic Auth and public endpoints for project, trace, and v2 observation reads; v2 observations expose field selection and cursor/pagination-oriented extraction.
  - Implementation screenshot `audits/2026-07-05-221840-langfuse-connect-v1/02-connected-sync-debug.png` shows a connected Langfuse Trace Project with redacted key preview, explicit trace-id/search sync controls, a synced trace row, and the trace opened directly in the reused `ThreadPlayground` debug workbench.
  - CEF verification with isolated `LLM_SPACE_HOME` connected a Langfuse project from the Trace Panel using `.env` credentials, showed `No traces synced yet` after connect, searched recent remote traces, synced a selected trace, opened it as a trace tab, and confirmed no relevant console errors or horizontal overflow at 1280px.
  - Storage verification confirmed `traces/projects/{project_id}/project.json` persists full local `publicKey` and `secretKey` as requested, while `traceListProjects` / `traceCreateConnectedProject` responses strip full keys and expose only redacted previews.
  - Bun smoke verification confirmed failed credential tests do not create a project, successful sync writes `raw.json` and `trace.json`, repeat sync upserts by remote trace id, and existing `workbench.json` is preserved.
  - `apps/desktop/src/bun/traces/langfuse-client.ts` owns Basic Auth, base URL normalization, redacted HTTP errors, bounded recent trace search, and bounded v2 observation fetching.
  - `apps/desktop/src/bun/traces/trace-manager.ts` now creates connected projects after credential validation, rejects manual JSON import for connected projects, syncs selected Langfuse trace ids, persists redacted sync status/errors, and reuses the manual trace normalizer/write path.
  - `apps/desktop/src/components/trace-panel/trace-panel.tsx` now exposes `Connect Langfuse`, connected project badges/previews, no-auto-sync empty state, trace-id sync, remote trace search/select sync, and manual import only for manual projects.
  - Polish audit screenshots `audits/2026-07-05-232553-trace-panel-polish/11-clean-connected-list.png`, `13-clean-sync-dialog-final.png`, `14-clean-connect-dialog.png`, and `15-clean-empty-traces.png` confirm the Trace Panel now has a visible panel title, clearer project/source hierarchy, labeled Langfuse connection fields, and a two-path sync dialog for exact trace-id sync or search/select sync.
  - Follow-up screenshot `audits/2026-07-05-232553-trace-panel-polish/16-connect-dialog-no-project-name.png` confirms connected Langfuse setup now only asks for base URL, public key, and secret key; the local project name is derived after validation.
  - Clean CEF verification on port `9372` confirmed no horizontal overflow at 1280px and no relevant console errors after the polish pass; screenshots and DOM text showed only redacted key previews.
  - Trace header/protocol repair evidence on 2026-07-06: CEF screenshot `audits/2026-07-06-trace-head-protocol/01-existing-cef-trace-head.png` shows the trace source header moved into `ThreadPlayground`, with the trace id rendered as a compact badge and a `Copy trace ID` action; DOM check showed no horizontal overflow.
  - Focused Bun regressions on 2026-07-06 verified trace title rename updates `trace.json`, `workbench.json`, and the listed trace title; v2 raw-string IO imports produce normal system/user/assistant text; existing workbenches with JSON wrapper text are repaired on read.
- Boundary: users can create a connected Langfuse Trace Project by entering base URL/public key/secret key, validate before save, persist the local connection in `project.json`, explicitly sync by trace id or by selecting from a bounded recent remote trace search, upsert the same remote trace without duplicating local rows, and open the synced trace in the existing trace-owned Debug workbench. Trace tabs expose editable trace titles, source context inside the workbench header, and a copyable trace-id badge.
- Explicit non-goals: no background daemon or automatic initial sync, no write-back to Langfuse, no org-wide multi-project account picker in V1, no full secret display after save, no OAuth, no OTLP collector, no raw timeline UI, no automatic deletion of local traces when remote traces disappear, and no exhaustive historical backfill.
- Visible gaps: date-range/cursor UI for large projects, credential rotation/delete/rename project management, richer sync diagnostics/history beyond latest redacted status, full raw trace timeline, global trace search, and JSONL/export variant expansion.

## Model Settings And Provider Management

- Status: operational settings surface
- Freshness: confirmed
- Last checked: 2026-07-31
- Evidence:
  - Current first-run CEF flow added `OpenAI Codex` through onboarding and persisted provider settings in the isolated root.
  - Previous log `logs/2026-07-02-195244-first-run-model-setup-v1.md` verified provider add/persist flows through onboarding and settings.
  - Current CEF screenshot `audits/2026-07-31-125706-seedream-discovery/01-ark-model-settings-current.png` shows the VolcEngine Ark settings surface exposing API key, base URL, and five chat models, with no image-generation configuration.
  - Current implementation screenshot `audits/2026-07-31-140829-seedream-image-generation-v1/01-ark-image-settings.png` shows the separate Ark Image generation card with Seedream 5.0 Pro and 2K defaults while chat models remain a distinct list.
  - Current correction screenshots `audits/2026-07-31-151134-seedream-image-model-parity/01-image-and-chat-model-parity.png` and `02-custom-image-model-editor.png` show Image models parallel to Chat models, with independent defaults, add/edit controls, per-row switches, counts, filtering/bulk actions, icons, and supported/default-size editing.
  - Real CEF interaction added `ep-seedream-custom`, persisted it across a full restart, supported a `0/5` all-disabled state, and opened a confirmation before deletion.
  - `packages/runtime/src/models/model-manager.test.ts` verifies custom image-model inventory without Chat-model registration, reload, duplicate-id rejection, and size/default validation.
  - Current CEF screenshot `audits/2026-07-31-161048-generate-image-tool-config/03-settings-no-defaults.png` confirms Ark Settings owns Image models and Chat models but no longer exposes provider-level image-generation defaults.
  - `packages/runtime/src/models/model-manager.test.ts` now verifies legacy provider defaults migrate to inventory-only configuration.
  - `apps/desktop/src/components/settings/models-page.tsx` owns provider/model CRUD UI.
- Boundary: manage builtin/custom chat providers and enabled Chat models through local settings; VolcEngine Ark additionally manages a separate curated/custom Image model inventory with add, edit, delete confirmation, enable/disable, bulk actions, filtering, count, and icon behavior. Provider settings do not choose `generate_image` execution defaults; each Thread tool owns that model/size/watermark policy, and image models never enter Chat model selection.
- Explicit non-goals: account management, cloud sync, provider billing/quota checks, or a paid connection-test action on image-model rows.
- Visible gaps: no image-specific connectivity or quota validation after a provider is configured; very large modality catalogs may need search/collapse; hover-revealed custom-model actions are less discoverable on touch-only input; the curated Seedream capability table requires maintenance as Ark evolves.

## Agent Image Generation

- Status: shipped native Ark Seedream V1
- Freshness: confirmed
- Last checked: 2026-07-31
- Evidence:
  - Current CEF screenshot `audits/2026-07-31-125706-seedream-discovery/01-ark-model-settings-current.png` shows no Seedream or image-generation section under VolcEngine Ark.
  - Current CEF screenshot `audits/2026-07-31-125706-seedream-discovery/02-built-in-tools-current.png` shows 16 built-in tools across File system, Web, and Misc, with no Media category or `generate_image` tool.
  - `packages/runtime/src/models/providers/ark.ts` defines Ark only as an OpenAI-compatible chat-completions provider.
  - `packages/runtime/src/tools/built-in/built-in-tools-module.ts` registers only web, filesystem, and misc contributions.
  - Existing `BuiltinToolCallResponse`, pi converters, Tool Result UI, and image-blob persistence already preserve native image content end to end, so the missing boundary is provider configuration and execution rather than rendering or storage.
  - Primary-source research in `research/seedream-primary-sources.md` confirms Ark's synchronous `POST /api/v3/images/generations`, Bearer API-key authentication, current Seedream model IDs, and base64 response option.
  - Current screenshot `audits/2026-07-31-140829-seedream-image-generation-v1/02-media-tool-picker.png` shows the Media category and enabled `generate_image` tool.
  - Current screenshots `03-generated-image-result.png` and `04-persisted-image-after-restart.png` show compact actual model/size metadata plus native inline image content before and after a full desktop restart.
  - The deterministic Ark fixture observed `doubao-seedream-5-0-pro-260628`, the exact Tool Call prompt, `size: "2K"`, `watermark: true`, `response_format: "b64_json"`, and `stream: false` from the real CEF/RPC/runtime path.
  - Current correction screenshots `audits/2026-07-31-151134-seedream-image-model-parity/03-all-disabled-tool-error.png`, `04-custom-model-success.png`, and `05-persisted-custom-result-after-restart.png` show actionable local failure with every image model disabled, successful generation through a custom endpoint id, retained image output after restart, and an unchanged Doubao Chat-model selection.
  - The correction fixture received no request for the all-disabled Tool Call, then received `ep-seedream-custom`, `2K`, watermark enabled, base64 output, and `stream: false` after re-enabling the custom model.
  - `packages/runtime/src/models/ark-image-generation.test.ts`, `packages/runtime/src/models/model-manager.test.ts`, `packages/runtime/src/tools/built-in/built-in-tools-module.test.ts`, and the full 386-test suite cover native request/result/error behavior, custom and disabled model behavior, structured output, and registration.
  - Current CEF screenshots `audits/2026-07-31-161048-generate-image-tool-config/01-tool-config-defaults.png` and `02-tool-config-selected.png` show enabled image-model, default-size, and watermark configuration directly beneath `generate_image` in Add built-in tools.
  - Current screenshots `04-native-image-result.png` and `05-disabled-model-error.png` show a persisted native result after restart and an actionable Tool Call error after the selected model is disabled.
  - The deterministic fixture received `ep-seedream-large`, `4K`, watermark disabled, base64 output, and `stream: false`; after that model was disabled, the failure path sent no image-generation request.
  - Full verification on 2026-07-31 passed 386 Bun tests, lint, root/runtime/server TypeScript, and the production renderer build; UI/desktop TypeScript still reports the unrelated existing `DraggableStyle` baseline in `message-list-view.tsx:287`.
- Boundary: a user can manage curated and custom Ark Seedream image models, add or manage `generate_image` from Media, bind one enabled image model plus default size/watermark policy to that Thread tool, let an Agent request one synchronous non-streaming image from a required prompt and optional size preset, inspect compact actual model/size metadata plus native image content, and retain both tool policy and result across restart. Disabled/deleted saved bindings remain explicit and report an actionable Tool Call error without sending an image-generation request.
- Explicit non-goals: reference-image editing, multi-image generation, partial/SSE previews, Access Key signing, OpenRouter, video generation, a new confirmation framework, or standalone image export.
- Visible gaps: no paid Ark account smoke test, image-specific connectivity check, prompt-aware preview accessible name, or representative-latency audit of the running state; builtin model capabilities remain curated rather than remotely discovered.
