"""Source-grounded LLM Space diagrams. Python list-based SVG, Fireworks style 1.

Run: python docs/architecture/build-atlas.py
Validate: python docs/architecture/build-atlas.py --skill-root <fireworks-tech-graph>
PNG export uses CairoSVG; no repository JavaScript dependencies are changed.
"""

from __future__ import annotations

import argparse
import hashlib
import html
import json
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parent.parent
DATE = "2026-09-03"
COMMIT = "c5fd749c4ec3d0d1e0d073a635ee361928d1646c"
COLORS = {"blue": "#2563eb", "green": "#16a34a", "purple": "#9333ea", "red": "#dc2626"}
TINTS = {"blue": "#eff6ff", "green": "#f0fdf4", "purple": "#faf5ff", "red": "#fef2f2"}


def esc(value):
    return html.escape(str(value), quote=True)


class Diagram:
    def __init__(self, slug, title, subtitle, width=1600, height=1000):
        self.slug, self.title, self.subtitle = slug, title, subtitle
        self.width, self.height = width, height
        self.background, self.edges, self.nodes, self.labels = [], [], [], []
        self.refs, self.notes, self.questions = [], [], []
        self.node_bounds = {}
        self.edge_count = 0
        self.text(60, 58, title, 28, bold=True)
        self.text(60, 92, subtitle, 15, color="#6b7280")

    def text(self, x, y, value, size=15, color="#111827", bold=False,
             anchor="start", owner=None, layer=None, semantic=True):
        attrs = ' data-graph-role="label"' if semantic else ""
        if owner:
            attrs += f' data-owner="{esc(owner)}"'
        out = self.labels if layer is None else layer
        out.append(f'<text x="{x}" y="{y}" font-size="{size}" fill="{color}" '
                   f'font-weight="{600 if bold else 400}" text-anchor="{anchor}"{attrs}>{esc(value)}</text>')

    def container(self, x, y, w, h, title, color="blue"):
        self.background.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="12" '
                               f'fill="{TINTS[color]}" fill-opacity="0.38" stroke="#d1d5db" '
                               'stroke-dasharray="6 5" data-graph-role="container"/>')
        self.text(x + 22, y + 32, title, 17, bold=True)

    def node(self, key, x, y, w, h, title, lines=(), color="blue", kind="box"):
        self.node_bounds[key] = (x, y, w, h)
        attrs = (f'id="{key}" data-graph-role="node" data-node-id="{key}" '
                 f'data-graph-bounds="{x},{y},{x+w},{y+h}"')
        self.nodes.append(f'<g {attrs}><title>{esc(title + " — " + " / ".join(lines))}</title>')
        if kind == "decision":
            self.nodes.append(f'<path d="M {x+w/2},{y} L {x+w},{y+h/2} L {x+w/2},{y+h} L {x},{y+h/2} Z" '
                              f'fill="{TINTS[color]}" stroke="{COLORS[color]}" stroke-width="1.5"/>')
        else:
            self.nodes.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="8" '
                              f'fill="{TINTS[color]}" stroke="#d1d5db" stroke-width="1.5"/>')
            # Semantic icons are inline vectors, never external fonts or URLs.
            ix, iy = x + 16, y + 16
            self.nodes.append('<g data-graph-role="decoration">')
            if kind == "store":
                self.nodes.append(f'<path d="M {ix},{iy+4} v 14 c 0,7 22,7 22,0 v -14" fill="none" stroke="{COLORS[color]}"/>')
                self.nodes.append(f'<ellipse cx="{ix+11}" cy="{iy+4}" rx="11" ry="4" fill="none" stroke="{COLORS[color]}"/>')
            elif kind == "browser":
                self.nodes.append(f'<rect x="{ix}" y="{iy}" width="23" height="19" rx="3" fill="none" stroke="{COLORS[color]}"/>')
                self.nodes.append(f'<path d="M {ix},{iy+6} h 23" stroke="{COLORS[color]}"/>')
            elif kind == "agent":
                self.nodes.append(f'<path d="M {ix+11},{iy} l 11,6 v 12 l -11,6 -11,-6 v -12 Z" fill="none" stroke="{COLORS[color]}"/>')
            else:
                self.nodes.append(f'<path d="M {ix},{iy} h 16 l 6,6 v 16 h -22 Z M {ix+16},{iy} v 6 h 6" fill="none" stroke="{COLORS[color]}"/>')
            self.nodes.append('</g>')
        if kind == "decision":
            self.text(x+w/2, y+h/2-8, title, 19, bold=True, anchor="middle", layer=self.nodes, semantic=False)
            for i, line in enumerate(lines):
                self.text(x+w/2, y+h/2+17+i*22, line, 13, anchor="middle", layer=self.nodes, semantic=False)
        else:
            title_units = sum(1 if ord(c) > 255 else 0.56 for c in title)
            title_size = min(19, (w-66)/max(1, title_units))
            self.text(x+50, y+34, title, round(title_size, 1), bold=True, layer=self.nodes, semantic=False)
            for i, line in enumerate(lines):
                self.text(x+20, y+64+i*24, line, 14, color="#475569", layer=self.nodes, semantic=False)
        self.nodes.append('</g>')

    def edge(self, points, label, lx, ly, color="blue", source="", target="", anchor="middle", dashed=False):
        self.edge_count += 1
        key = f"edge-{self.edge_count}"
        d = "M " + " L ".join(f"{x},{y}" for x, y in points)
        dash = ' stroke-dasharray="7 5"' if dashed else ""
        self.edges.append(f'<path id="{key}" data-edge-id="{key}" data-graph-role="edge" '
                          f'data-source="{source}" data-target="{target}" d="{d}" fill="none" '
                          f'stroke="{COLORS[color]}" stroke-width="2.5"{dash} marker-end="url(#arrow-{color})"/>')
        if label:
            self.text(lx, ly, label, 14, color=COLORS[color], anchor=anchor, owner=key)

    def down(self, a, b, label, color="blue", dx=14):
        x, y, w, h = self.node_bounds[a]
        bx, by, bw, bh = self.node_bounds[b]
        assert x+w/2 == bx+bw/2
        self.edge([(x+w/2, y+h), (bx+bw/2, by)], label, x+w/2+dx, (y+h+by)/2,
                  color, a, b, anchor="start")

    def right(self, a, b, label, color="blue"):
        x, y, w, h = self.node_bounds[a]
        bx, by, bw, bh = self.node_bounds[b]
        assert y+h/2 == by+bh/2
        self.edge([(x+w, y+h/2), (bx, by+bh/2)], label, (x+w+bx)/2, y+h/2-12, color, a, b)

    def footer(self, text):
        self.text(60, self.height-88, text, 15, bold=True)
        y = self.height-42
        for x, color, label in [(60, "blue", "请求 / 主流程"), (350, "purple", "事件 / 结果 / 循环"), (690, "green", "持久化 / 读取"), (1010, "red", "检查 / 中止 / 边界")]:
            self.background.append(f'<g data-graph-role="legend"><line x1="{x}" y1="{y-5}" x2="{x+32}" y2="{y-5}" stroke="{COLORS[color]}" stroke-width="2.5"/></g>')
            self.text(x+42, y, label, 13, color="#6b7280")
        self.text(self.width-60, 58, DATE, 13, color="#6b7280", anchor="end")

    def svg(self):
        lines = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {self.width} {self.height}" width="{self.width}" height="{self.height}" '
                 'data-generator="fireworks-tech-graph" data-quality-profile="showcase" role="img" aria-labelledby="diagram-title diagram-desc">',
                 f'<title id="diagram-title">{esc(self.title)}</title>', f'<desc id="diagram-desc">{esc(self.subtitle)}</desc>',
                 '<style>text { font-family: "Microsoft YaHei", "PingFang SC", "Helvetica Neue", Arial, sans-serif; }</style>',
                 '<defs>']
        for name, color in COLORS.items():
            lines.append(f'<marker id="arrow-{name}" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto" markerUnits="userSpaceOnUse"><polygon points="0 0,10 3.5,0 7" fill="{color}"/></marker>')
        lines += ['</defs>', f'<rect width="{self.width}" height="{self.height}" fill="#ffffff" data-graph-role="background"/>']
        lines += self.background + self.edges + self.nodes + self.labels + ['</svg>']
        return "\n".join(lines)


def make_diagrams():
    diagrams = []
    d = Diagram("01-system-architecture", "01  项目运行架构", "四条宿主路径；同名 core / UI 表示复用代码，不表示共享进程或相同权限。", height=1100)
    lanes = [
        (60, "Desktop / 本地桌面", "blue", [
            ("d-ui", "Desktop renderer", ["apps/desktop · React / Electrobun", "注入 HostServices / ModelClient"], "browser"),
            ("d-runtime", "Desktop Bun host", ["apps/desktop + packages/runtime", "RuntimeRouter · models / tools"], "agent"),
            ("d-core", "core/server · Agent", ["streamAgent → pi-agent / pi-ai", "本机 Provider 配置与 API 凭据"], "agent")]),
        (440, "Guest Web / 浏览器游客", "blue", [
            ("g-ui", "GuestWorkbench", ["apps/web + packages/ui", "Thread store · 浏览器本地工作区"], "browser"),
            ("g-api", "Guest API", ["apps/cloud · guest-index.ts", "请求校验 / 并发 / 额度 / 工具代理"], "agent"),
            ("g-core", "core/server · Agent", ["streamAgent → 白名单模型", "Provider 凭据留在服务端"], "agent")]),
        (820, "Viewer / 分享阅读", "purple", [
            ("v-ui", "ThreadViewer", ["apps/web + ThreadPlayground", "readonly · 展示分享内容"], "browser"),
            ("v-read", "Gist connector", ["packages/core/storage", "读取 Thread JSON 与元数据"], "box"),
            ("v-gist", "GitHub Gist", ["Desktop 分享流程写入 Gist", "Viewer 无运行 transport"], "store")]),
        (1200, "Identity / 身份服务", "green", [
            ("i-user", "OAuth / Session", ["GitHub OAuth 回调与会话请求", "独立于匿名 Guest Run 路径"], "browser"),
            ("i-api", "Cloud identity", ["apps/cloud · index.ts", "OAuth / Cookie / tenant 初始化"], "agent"),
            ("i-db", "PostgreSQL", ["用户 / 租户 / membership / session", "RLS；表存在不等于业务 API 完整"], "store")]),
    ]
    for x, title, color, nodes in lanes:
        d.container(x-20, 130, 360, 660, title, color)
        for y, (key, name, lines, kind) in zip([195, 425, 655], nodes):
            d.node(key, x, y, 320, 110, name, lines, color, kind)
    for a,b,label in [("d-ui","d-runtime","typed RPC"),("d-runtime","d-core","AgentStreamRequest"),("g-ui","g-api","HTTP / SSE"),("g-api","g-core","受限请求"),("v-ui","v-read","分享 locator"),("v-read","v-gist","读取请求"),("i-user","i-api","OAuth code / cookie"),("i-api","i-db","会话与租户数据")]:
        d.down(a,b,label,"green" if a.startswith("i") else "blue")
    d.text(60, 842, "packages/ui：共享交互与状态；HostServices 负责宿主能力，ModelClient 负责模型目录与连接选择。", 17, bold=True)
    d.text(60, 879, "packages/core：Thread / Prompt / 转换 / reducer；core/server：Agent 流与服务端存储。packages/runtime：可信宿主的集成与路由。", 15)
    d.text(60, 916, "Remote Runtime：Desktop Bun 可切换到 apps/server，再复用 runtime / core；远端连接与请求路径见图 09。", 15)
    d.footer("证据边界：当前源码的组件与连接；没有据此宣称已部署或线上可用。")
    d.refs = ["desktop-root", "host-types", "web-host", "viewer", "guest-entry", "identity-entry", "cloud-http", "cloud-schema", "core-exports"]
    d.notes = ["从宿主开始阅读，再追踪共享包。身份服务和 Guest API 是不同入口。", "共享 UI 不授予文件系统、Bash、MCP 或 Provider 凭据访问权。"]
    d.questions = ["为什么 web bundle 不能导入 core/server？", "如果换成远程模型执行，哪些 UI 代码无需变化？"]
    diagrams.append(d)

    d = Diagram("02-desktop-run-sequence", "02  一次 Desktop Run 的时序", "时间从上往下；图中画单个模型回合。多回合工具循环在图 04。", height=1140)
    xs = [160, 410, 660, 910, 1160, 1410]
    titles = ["Thread store", "RPC transport", "Bun RPC / Router", "LocalRuntimeClient", "streamAgent", "Model provider"]
    for i,(x,title) in enumerate(zip(xs,titles)):
        d.node(f"p{i}", x-100, 145, 200, 80, title, [], kind="agent" if i>=3 else "box")
        d.background.append(f'<line x1="{x}" y1="230" x2="{x}" y2="915" stroke="#d1d5db" stroke-dasharray="5 6" data-graph-role="decoration"/>')
    messages = [
        (0,1,285,"1  streamThread：转换后的 request + connection", "blue"),
        (1,2,355,"2  sendStreamThreadRequest：runtimeId + streamId", "blue"),
        (2,3,425,"3  forwardStreamThread / getRuntime", "blue"),
        (3,4,495,"4  StreamThreadController：解析模型连接", "blue"),
        (4,5,565,"5  models.streamSimple：Prompt / messages / tools", "blue"),
        (5,4,635,"6  流式模型输出", "purple"),
        (4,3,705,"7  AgentEvent", "purple"),
        (3,2,775,"8  { streamId, event / done / error }", "purple"),
        (2,1,845,"9  receiveStreamThreadResponse", "purple"),
        (1,0,915,"10  AsyncIterable → reduceMessages → UI", "purple")]
    for a,b,y,label,color in messages:
        # Full text uses open space above each message; no horizontal rails intersect.
        label_width = sum(14 if ord(c) > 255 else 8 for c in label)
        d.labels.append(f'<rect x="{min(xs[a],xs[b])-3}" y="{y-31}" width="{label_width+8}" height="23" fill="#ffffff" data-graph-role="decoration"/>')
        d.edge([(xs[a],y),(xs[b],y)], label, min(xs[a],xs[b]), y-14,color,f"p{a}",f"p{b}",anchor="start")
    d.text(60, 966, "开始：idle → preparing（校验与模板渲染）→ running。结束：取消节流任务、结算结果与历史，再回到 idle。", 15)
    d.text(60, 1000, "停止：AbortSignal → abortStreamThread(streamId) → RuntimeClient.abortStream → Controller AbortController。", 15)
    d.footer("只有已收到事件、未失败且未中止的运行才写普通 Run history；失败 / 中止不伪装成成功快照。")
    d.refs=["thread-run","rpc-transport","forward-stream","rpc-dispatch","runtime-local","stream-controller","stream-agent","reducer"]
    d.notes=["streamId 用于过滤不同运行的事件；runtimeId 用于选择执行宿主。", "Thread store 负责把每个回合的增量事件还原成预览与最终消息。"]
    d.questions=["为什么保存一个 AbortController 还不足以取消远端请求？", "模型失败时为什么不能只根据收到过事件就记录成功 Run？"]
    diagrams.append(d)

    d=Diagram("03-guest-data-flow","03  Guest Web 的数据流","顺着蓝色请求向右，再沿紫色结果向左；浏览器状态与服务端额度分别持久化。",height=1140)
    for x,title,col in [(40,"浏览器 · apps/web + packages/ui","blue"),(580,"服务端 · apps/cloud Guest API","red"),(1120,"模型适配 / 外部供应商","purple")]:
        d.container(x,135,440,775,title,col)
    d.node("browser",70,210,380,120,"Guest Thread",["模板、消息、模型、工具定义","createGuestTransport(request)"],kind="browser")
    d.node("gate",610,210,380,120,"Guest 请求检查",["Origin / 大小 / 模型与工具白名单","按 guest 限并发；guest / IP 额度"],"red","agent")
    d.node("model",1150,210,380,120,"GuestModelExecutor",["服务端 streamAgent → BigModel","受限配置；API key 不返回浏览器"],"purple","agent")
    d.right("browser","gate","POST /runs")
    d.right("gate","model","受限请求")
    d.node("ui-results",70,565,380,120,"消息与 Run 结果",["parseGuestStreamData → reduceMessages","文本 / toolCall / usage / 错误"],"purple","browser")
    d.node("sse",610,565,380,120,"SSE response",["AgentEvent + [START] / [DONE]","失败转换为 guest_run_error"],"purple","box")
    d.node("model-events",1150,565,380,120,"模型事件",["增量消息、工具请求、结束事件","本轮结果；不直接执行浏览器工具"],"purple","box")
    d.down("model","model-events","AgentEvent","purple")
    d.edge([(1150,625),(990,625)],"SSE data",1070,613,"purple","model-events","sse")
    d.edge([(610,625),(450,625)],"AgentEvent",530,613,"purple","sse","ui-results")
    d.node("local",70,760,380,120,"localStorage",["Thread / 偏好 / 虚拟文件","评测实验单独存储（图 07）"],"green","store")
    d.node("quota",610,405,380,110,"额度计数存储",["Bun: SQLite；Node 入口: JSON","HMAC(guest / IP) + day + run_count"],"green","store")
    d.edge([(740,330),(740,405)],"guestId / IP",726,372,"green","gate","quota",anchor="end")
    d.edge([(850,405),(850,330)],"额度决策",864,372,"green","quota","gate",anchor="start")
    d.node("tools",1150,760,380,120,"受限工具通道",["浏览器虚拟工具；Web / MCP 代理","独立端点与网络 / 输出 / 并发限制"],"red","agent")
    d.down("ui-results","local","Thread JSON","green")
    d.text(610,785,"额度在开始模型流之前消耗。",15)
    d.text(610,822,"计数存储不保存对话正文。",15)
    d.text(70,950,"工具分支（图 04）：toolCall → Host 策略 → 浏览器虚拟工作区，或 /api/guest/tools/*、/api/guest/mcp/* → toolResult。",15)
    d.text(70,984,"普通 Guest ReAct：最多 6 个模型回合、8 次自动工具调用；每个模型回合重新经过 /api/guest/runs 检查并消耗额度。",15)
    d.footer("浏览器预检帮助用户理解限制；服务端独立执行输入、模型、并发和额度检查。")
    d.refs=["guest-api","guest-gate","guest-validation","guest-model","guest-quota","guest-node","guest-workspace","guest-tools","guest-tool-service","web-host"]
    d.notes=["SSE 是同一次 HTTP 请求的流式响应。图按请求和返回拆行，便于区分两种方向。", "额度存储节点表示 gate 的内部依赖；模型响应失败不等于自动返还已消耗额度。"]
    d.questions=["为什么删除 localStorage 不等于重置 IP 额度？", "一个有两轮模型调用的 ReAct Run 经过几次服务端额度检查？"]
    diagrams.append(d)

    d=Diagram("04-tool-loop","04  工具调用与 ReAct 循环","模型提出工具请求；共享 Thread store 驱动策略检查、工具执行和下一次模型调用。",width=1740,height=1060)
    d.node("turn",60,180,340,140,"streamTurn",["准备上下文 → transport → 模型","core 的工具执行器返回 terminate","真实工具交给宿主执行"],kind="agent")
    d.node("calls",540,180,340,140,"reduceMessages",["assistant.toolCalls","工具名 + arguments + call id"],"purple")
    d.node("allow",1020,180,340,140,"允许自动执行？",["全部工具可执行", "策略 / 风险 / 调用数"],"red","decision")
    d.node("review",1480,180,200,140,"暂停待审",["手动处理 / 补结果","不自动越过限制"],"red")
    d.right("turn","calls","AgentEvent","purple")
    d.right("calls","allow","toolCalls","purple")
    d.right("allow","review","否","red")
    d.node("execute",1020,480,340,140,"Host executeTool",["Builtin / MCP / Plugin","同一批工具 Promise.all","实际权限由宿主与服务端决定"],kind="agent")
    d.down("allow","execute","是：受控调用")
    d.node("results",540,480,340,140,"工具结果入消息",["content + isError + call id","绑定原 toolCall.output"],"purple")
    d.edge([(1020,550),(880,550)],"toolResult",950,538,"purple","execute","results")
    d.node("repeat",60,480,340,140,"继续回合？",["reactLoop 开启", "仍在回合上限内"],"red","decision")
    d.edge([(540,550),(400,550)],"含结果的上下文",470,538,"purple","results","repeat")
    d.edge([(230,480),(230,320)],"是：下一回合",246,407,"purple","repeat","turn",anchor="start")
    d.node("settle",60,790,340,110,"结算运行",["停止循环 → finalizeActiveRun","清理状态 / 按结果保存历史"],"green")
    d.down("repeat","settle","否","red")
    d.text(540,760,"autoRunTools = false：首轮完成后停止，保留待执行工具调用。",17,bold=True)
    d.text(540,805,"autoRunTools = true、reactLoop = false：自动执行本轮工具，然后停止。",16)
    d.text(540,850,"reactLoop = true：工具结果回填后再次请求模型；无工具、失败、中止或限额都会结束。",16)
    d.text(540,895,"function stub 需要手填结果；破坏性 Bash 与不满足宿主策略的工具不会自动执行。",16)
    d.footer("图示展开“有待执行工具”的路径；provider-hosted native tools 由供应商执行，不经过 Host executeTool。")
    d.refs=["tool-loop","thread-run","stream-agent","host-types","guest-tools","web-host"]
    d.notes=["autoRunTools 与 reactLoop 是两个不同开关，不能用“工具执行成功”代表模型最终回答完成。", "本图外层循环位于 packages/ui 的 Thread store，而不是全部藏在服务端 Agent 内。"]
    d.questions=["为什么模型返回 bash 参数不能视为用户授权？", "function、builtin、MCP、Plugin 和 provider-hosted tool 的执行位置有什么区别？"]
    diagrams.append(d)

    d=Diagram("05-persistence","05  Thread、快照与存储边界","区分可编辑内容、派生运行快照、瞬时 UI 状态，以及游客与身份服务各自的数据。",height=1180)
    d.container(40,135,920,680,"Desktop / Remote：各自的 LLM_SPACE_HOME","green")
    d.node("thread-store",70,205,370,130,"Thread store（内存）",["thread / streamingMessage / status","changeHistory（Undo / Redo）","runHistory 与评估引用"],kind="browser")
    d.node("save",560,205,370,130,"SerializedPersistence",["ThreadTabPane 防抖、串行写入","runtimeId 绑定正确存储宿主","LocalFileSystem.write / archiveRun"],"green")
    d.right("thread-store","save","Thread","green")
    d.node("workspace",560,465,370,130,"workspace/",["用户 Thread JSON","runHistoryIndex 保存轻量引用","规范化 → schema → 原子文件写入"],"green","store")
    d.down("save","workspace","规范化 Thread JSON","green")
    d.node("history",70,465,370,130,"history/",["sha256(resourceKey) / index.json","entryRef → 完整运行快照","不把派生文件放进 workspace"],"green","store")
    d.edge([(560,530),(440,530)],"snapshotRef",500,518,"green","workspace","history")
    d.node("settings",70,680,370,100,"settings/",["模型连接 / MCP / 网络等配置"],"green","store")
    d.node("traces",560,680,370,100,"traces/ + plugins",["独立管理；不等同于 Thread 本文"],"green","store")
    d.container(1020,135,540,680,"其他持久化域","blue")
    d.node("guest-store",1050,205,480,130,"Guest localStorage",["工作区与虚拟文件在浏览器","评测实验独立 key，含失败证据","没有在此建立 PostgreSQL 同步边"],"green","store")
    d.node("quota-store",1050,425,480,130,"Guest 额度",["SQLite（Bun）/ JSON（Node 入口）","按 HMAC 身份与 UTC day 计数"],"green","store")
    d.node("identity-store",1050,645,480,130,"Cloud PostgreSQL",["用户、租户、会话与 RLS schema","当前 HTTP 入口主要是 OAuth / session"],"green","store")
    d.text(60,865,"文件复制 cp：复制并重新关联历史；移动 mv：历史随 resourceKey 重键；写入时 prune 清除不再引用的快照。",16,bold=True)
    d.text(60,910,"删除 Thread：历史不会立即删除。maintain 首次发现资源缺失时记录 orphanedAt，超过 30 天保留期后回收。",16)
    d.text(60,955,"Run history：保存成功完成的运行。changeHistory：为编辑与 Undo / Redo 服务。Trace：用于查看运行与工具证据。",16)
    d.text(60,1000,"保存快照与保存 Thread 属于不同阶段；请以各层错误处理为准，不把多文件操作描述成跨文件数据库事务。",16)
    d.footer("一份 Thread 内容可以复用；数据归属始终跟随 runtime、浏览器来源或租户边界。")
    d.refs=["thread-tab","thread-run","local-fs","history-store","desktop-root","guest-workspace","guest-evaluation-store","guest-quota","guest-node","cloud-http","cloud-schema"]
    d.notes=["虚线框表示不同持久化归属，不表示自动同步。", "运行失败可能保留部分消息，普通成功历史与评测失败证据的策略不同。"]
    d.questions=["为什么移动 Thread 时必须同步 re-key 历史？", "清理 history 与删除 workspace 文件，恢复能力有何不同？"]
    diagrams.append(d)

    d=Diagram("06-capability-matrix","06  宿主能力矩阵","同一套 ThreadPlayground，根据 HostServices、transport 与服务端策略得到不同能力。",height=1000)
    widths=[250,305,305,305,305]
    headers=["能力 / 数据归属","Desktop Local","Desktop → Remote","Guest Web","Shared Viewer"]
    rows=[
        ["运行模型","本机 Provider 连接","远端 Provider 连接","Guest API 白名单","无运行 transport"],
        ["模型凭据","Desktop Bun 管理","远端 runtime 管理","Guest 服务端持有","不需要模型凭据"],
        ["工具执行","Builtin / MCP / Plugin","远端能力约定 / RPC","虚拟工具 + 受限代理","不可执行"],
        ["真实文件 / Bash","宿主支持；受策略约束","远端文件与 Shell","不提供真实文件 / Shell","不可访问"],
        ["MCP","本机配置与管理","按远端 capabilities","受限 HTTP/MCP；无 stdio","不可调用"],
        ["Thread 持久化","本机 workspace / history","远端 workspace / history","浏览器 localStorage","读取分享 Gist"],
        ["运行鉴权 / 限制","本机连接配置","Bearer + 兼容性协商","Guest / IP 额度与并发","只读分享内容"],
        ["LangGraph 导出","Desktop generator","取决于导出宿主实现","generator = null","不可导出项目"],
    ]
    y=150
    for ri,row in enumerate([headers]+rows):
        x=60
        for ci,(w,value) in enumerate(zip(widths,row)):
            fill="#eff6ff" if ri==0 else ("#f8fafc" if ri%2 else "#ffffff")
            d.background.append(f'<rect x="{x}" y="{y}" width="{w}" height="68" fill="{fill}" stroke="#e2e8f0" data-graph-role="decoration"/>')
            d.text(x+18,y+41,value,16 if ri==0 else 15,bold=ri==0 or ci==0)
            x+=w
        y+=68
    d.text(60,824,"读取方式：先确定当前宿主，再判断 transport、工具策略、数据归属；界面上出现工具名不代表工具可执行。",17,bold=True)
    d.text(60,866,"Remote 是 Desktop 选择的执行位置；Cloud identity 是独立身份服务，不能据此推定 Guest 已有账号同步或团队协作。",15)
    d.footer("矩阵列出源码能力边界；外部配置、凭据、网络和部署可用性仍需独立验证。")
    d.refs=["host-types","web-host","viewer","guest-tools","guest-tool-service","runtime-contract","remote-client","server-http","desktop-generator"]
    d.notes=["HostServices 是能力注入界面，不是绕过服务端权限的凭证。", "Remote 的 API 能力由协议协商结果决定，不应假设本机所有操作均等价可用。"]
    d.questions=["为什么 Guest 工具列表出现 bash 仍不能执行真实 Shell？", "Viewer 和 Guest 复用 UI，为什么依然要分别验证能力？"]
    diagrams.append(d)

    d=Diagram("07-evaluation-loop","07  Evaluation Lab V2 的改进循环","从冻结的源 Thread 出发，在隔离实验中比较 Baseline / Candidate，审阅差异后有条件地应用。",height=1180)
    positions=[(60,180),(610,180),(1160,180),(1160,495),(610,495),(60,495)]
    specs=[
        ("source","冻结实验输入",["sourceThread → Baseline","Candidate 可编辑模型与 Prompt","Cases / expectations / rubrics"],"blue"),
        ("batch","批次预检与顺序运行",["selected cases × 两个 variant","额度预估；逐项 await","每项独立 Thread store"],"blue"),
        ("evidence","收集运行证据",["最多 3 模型回合 / 8 自动工具","checks / token / duration / tool","completed / failed / needs_review"],"purple"),
        ("review-eval","回归比较与人工评价",["improved / regressed / unchanged","unknown；复核队列与重跑","导出 JSON / HTML 报告"],"purple"),
        ("apply","预览并应用 Candidate",["对照 source / current / candidate","有冲突 → 拒绝应用","先持久化成功，再恢复 UI"],"red"),
        ("next","下一轮实验",["新 sourceThread + lineage","继承 Cases；清空 runs / 评价","保留旧实验的历史证据"],"green"),
    ]
    for (x,y),(key,title,lines,color) in zip(positions,specs):
        d.node(key,x,y,380,150,title,lines,color,kind="agent")
    d.right("source","batch","实验快照")
    d.right("batch","evidence","隔离运行")
    d.down("evidence","review-eval","结果与检查","purple")
    d.edge([(1160,570),(990,570)],"人工确认",1075,558,"red","review-eval","apply")
    d.edge([(610,570),(440,570)],"应用成功",525,558,"green","apply","next")
    d.edge([(250,495),(250,330)],"继续比较",268,418,"purple","next","source",anchor="start")
    d.node("eval-storage",60,825,680,120,"localStorage · evaluation-lab.v2",["实验与普通 Thread / Run history 分离；v1 可迁移","最多 10 个实验、每实验最多 50 Cases；默认批次 3 Cases"],"green","store")
    d.node("current-thread",860,825,680,120,"应用范围：当前 Thread 的选定字段",["model.provider / id / temperature / maxTokens + systemPrompt","保留当前消息、工具、历史；不把整份实验结果覆盖回 Thread"],"green","store")
    d.text(60,732,"额度估算：所选 Run 项数 × 3 个模型回合；正常首次批次通常为所选 Case 数 × 2 个 variant × 3。",16,bold=True)
    d.text(60,774,"普通运行仍经过 Guest API；实验没有绕过白名单、单用户并发或服务端额度，也没有自动 LLM Judge。",15)
    d.footer("当前源码已含 V2 lineage / 回归 / 应用逻辑；此图不代表本轮已执行模型评测或验证线上版本。")
    d.refs=["evaluation-core","evaluation-promotion","evaluation-next","evaluation-runner","evaluation-batch","evaluation-apply","guest-evaluation-store"]
    d.notes=["不要沿用旧文档中“V2 仅计划”的描述；本图以当前源码为依据。", "应用时再次计算冲突；若当前 Thread 已改变或浏览器保存失败，不应在 UI 中假装应用成功。"]
    d.questions=["为什么跑实验时不能直接修改用户正在编辑的 Thread？", "若评测后用户修改了模型，应用 Candidate 时应该发生什么？"]
    diagrams.append(d)

    d=Diagram("08-prompt-and-export","08  Prompt 渲染与 Python 导出","编辑态模板、运行态请求、冻结快照与独立导出项目是不同的数据形态。",height=1100)
    d.node("editable",60,180,400,130,"编辑态 ThreadContext",["systemPrompt / messages / tools","变量定义与模板仍可编辑","不把模板直接当作最终模型输入"],kind="box")
    d.node("render",610,180,400,130,"renderThreadPromptVariables",["加载变量、Skills、文件","renderTemplateText / Nunjucks","得到 rendered context + snapshot"],kind="agent")
    d.right("editable","render","模板 / 变量")
    d.node("request",1160,180,380,130,"运行请求",["streamThread → convertToPiContext","AgentStreamRequest","transport → core/server"],kind="agent")
    d.right("render","request","渲染结果")
    d.node("snapshot",610,465,400,130,"Prompt snapshot",["冻结变量与渲染输出","随运行快照记录，供检查 / 重放","编辑变量或模板时按语义失效"],"green","store")
    d.down("render","snapshot","snapshot","green")
    d.node("generator",60,765,400,140,"langgraphGenerator",["Desktop 宿主选择目标目录","按 Thread / 模型 / 工具确定性生成","生成过程不调用 LLM"],kind="agent")
    d.node("python",610,765,400,140,"Python / uv 项目",["agent / model / variables.py","受支持 built-in 工具的真实实现","MCP 配置；自定义 function stub"],"green","box")
    d.node("followup",1160,765,380,140,"导出边界",["references/ + PLAN.md 说明待办","Plugin / provider-hosted tools 拒绝","未知 built-in 不自动补成真实实现"],"red","box")
    d.edge([(260,310),(260,765)],"导出输入（另一路径）",276,565,"blue","editable","generator",anchor="start")
    d.right("generator","python","源码文件","green")
    d.right("python","followup","检查待办","red")
    d.text(60,980,"修改内置变量 / 函数 / filter / macro：同时维护 TypeScript 与生成的 Python，并执行生成 Python 的回归验证。",16,bold=True)
    d.footer("可导出不等于所有工具都已实现；阅读 PLAN.md 与 references，再验证生成项目的实际运行能力。")
    d.refs=["prompt-vars","template-render","client-api","client-converters","langgraph","python-variables","desktop-generator","generator-tests"]
    d.notes=["图中竖向导出箭头表示独立功能入口，导出宿主仍会准备渲染结果和模型/工具配置。", "Thread 的编辑态内容与运行快照分开，便于解释“当时到底向模型发送了什么”。"]
    d.questions=["为什么回看历史时不能只用当前变量重新渲染？", "为什么改变 Prompt 内置函数需要验证 TypeScript / Python 两端？"]
    diagrams.append(d)

    d=Diagram("09-remote-runtime","09  Remote Runtime 的连接与数据路径","Desktop 是控制界面；远端 apps/server 是执行宿主。连接管理与模型数据流分开理解。",height=1200)
    d.container(40,135,1520,345,"连接建立 / 控制面","red")
    d.node("connect",70,210,380,130,"RemoteServerManager",["SSH 托管连接或手工 HTTP 地址","SSH 路径需主机身份信任","远端 server 启动 / 连接管理"],"red","agent")
    d.node("health",610,210,380,130,"RemoteRuntimeClient",["Bearer GET /health","核对 protocol / version / capabilities","失败不注册成可用 runtime"],"red","agent")
    d.node("register",1150,210,380,130,"RuntimeRouter",["注册 RuntimeClient","使用 runtimeId 选择本机或远端","共享 UI 继续使用相同宿主接口"],kind="agent")
    d.right("connect","health","连接信息","red")
    d.right("health","register","协商结果","red")
    d.text(70,421,"SSH 解决连接与远端生命周期；HTTP API 仍校验 Bearer。协议兼容性与业务操作能力分别检查。",16)
    d.container(40,530,1520,420,"运行数据 / 数据面","blue")
    d.node("desktop",70,615,380,130,"Desktop Bun client",["Renderer RPC → RemoteRuntimeClient","POST /rpc：文件 / 模型 / 工具等","POST /stream：request + connection"],kind="agent")
    d.node("server",610,615,380,130,"apps/server",["assertAuthorized → HTTP 路由","LocalRuntimeClient / Controller","自己的文件、模型连接与工具配置"],kind="agent")
    d.node("remote-core",1150,615,380,130,"远端 core/server",["streamAgent → Provider","执行位置与凭据属于远端宿主","共享语义与本机路径相同"],kind="agent")
    d.right("desktop","server","Bearer HTTP")
    d.right("server","remote-core","Agent request")
    d.edge([(1150,710),(1080,710),(1080,850),(800,850)],"AgentEvent",965,835,"purple","remote-core","server")
    d.edge([(800,850),(260,850)],"SSE data → RPC events → UI reducer",530,835,"purple","server","desktop")
    # The return rail terminates at the participant lifeline extension, not an unrelated box.
    d.background.append('<line x1="800" y1="745" x2="800" y2="905" stroke="#d1d5db" stroke-dasharray="5 6" data-graph-role="decoration"/>')
    d.background.append('<line x1="260" y1="745" x2="260" y2="905" stroke="#d1d5db" stroke-dasharray="5 6" data-graph-role="decoration"/>')
    d.text(60,1008,"中止：Desktop abortStream → 取消远端 fetch；服务端响应 cancel → runtime.abortStream(streamId)。",16,bold=True)
    d.text(60,1050,"/health、/rpc、/stream、/shutdown 都在鉴权之后；不要把 apps/server 当作匿名 Guest API。",16)
    d.footer("远端文件和本机文件是两个归属域；runtimeId 必须沿查询、工具执行、保存和历史读取路径保留。")
    d.refs=["remote-server-manager","remote-runtime-manager","remote-client","runtime-router","runtime-contract","server-http","server-stream","server-factory"]
    d.notes=["返回通道画到竖向参与者延长线；紫色箭头方向明确表示从远端回到桌面。", "远端 HTTP /rpc 是统一能力接口，与 Guest 的受限工具代理不是同一个服务。"]
    d.questions=["只验证远端 /health 为 200 是否足以判断能运行某个工具？", "为什么切换 runtime 后仍使用相同 Thread store？"]
    diagrams.append(d)
    return diagrams


# Each anchor is resolved against actual current source and recorded with a digest.
SOURCES = {
    "desktop-root": ("apps/desktop/src/bun/app/start-desktop-app.ts", "const workspacePath"),
    "host-types": ("packages/ui/src/host/types.ts", "export interface ToolExecutionPolicy"),
    "web-host": ("apps/web/src/host/web-host.ts", "export const webHost"),
    "viewer": ("apps/web/src/thread-viewer.tsx", "ThreadPlayground"),
    "guest-entry": ("apps/cloud/src/guest-index.ts", "const quotaStore"),
    "identity-entry": ("apps/cloud/src/index.ts", "assertRuntimeDatabaseIsolation(config.databaseUrl)"),
    "cloud-http": ("apps/cloud/src/http-server.ts", "url.pathname === \"/api/session\""),
    "cloud-schema": ("apps/cloud/migrations/0001_identity_and_tenants.sql", "CREATE TABLE"),
    "core-exports": ("packages/core/package.json", "\"./server\""),
    "thread-run": ("packages/ui/src/components/thread-playground/stores/thread-store.ts", "async run(fromMessageId"),
    "tool-loop": ("packages/ui/src/components/thread-playground/stores/thread-store.ts", "const executePendingToolCalls"),
    "rpc-transport": ("apps/desktop/src/client/rpc-transport.ts", "export function createRpcTransport"),
    "forward-stream": ("apps/desktop/src/bun/rpc/stream-thread-request.ts", "export async function forwardStreamThread"),
    "rpc-dispatch": ("apps/desktop/src/bun/rpc/index.ts", "forwardStreamThread("),
    "runtime-local": ("packages/runtime/src/runtime/local-runtime-client.ts", "streamThread("),
    "stream-controller": ("packages/runtime/src/streaming/stream-thread.ts", "export class StreamThreadController"),
    "stream-agent": ("packages/core/src/server/agent/stream.ts", "export async function* streamAgent"),
    "reducer": ("packages/core/src/client/reducer.ts", "export function reduceMessages"),
    "guest-api": ("apps/web/src/guest/guest-api.ts", "export function createGuestTransport"),
    "guest-gate": ("apps/cloud/src/guest-http-server.ts", "url.pathname === \"/api/guest/runs\""),
    "guest-validation": ("apps/cloud/src/guest-http-server.ts", "request.model?.provider"),
    "guest-model": ("apps/cloud/src/guest-model.ts", "export function createGuestModelExecutor"),
    "guest-quota": ("apps/cloud/src/guest-quota.ts", "export class GuestQuotaStore"),
    "guest-node": ("apps/cloud/src/guest-node-index.ts", "const quotaStore"),
    "guest-workspace": ("apps/web/src/guest/guest-workspace.ts", "persistGuestThreadUpdate"),
    "guest-tools": ("apps/web/src/guest/guest-tools.ts", "canGuestAutoExecute"),
    "guest-tool-service": ("apps/cloud/src/guest-tool-service.ts", "export"),
    "thread-tab": ("apps/desktop/src/components/thread-tabs/thread-tab-pane.tsx", "new SerializedPersistence"),
    "local-fs": ("packages/core/src/server/storage/local/file-system.ts", "async write(p: string"),
    "history-store": ("packages/core/src/server/storage/local/run-history-store.ts", "export class RunHistoryStore"),
    "guest-evaluation-store": ("apps/web/src/guest/guest-evaluation-lab.ts", "export const GUEST_EVALUATION_LAB_STORAGE_KEY"),
    "runtime-contract": ("packages/runtime/src/runtime/types.ts", "export interface RuntimeClient"),
    "remote-client": ("apps/desktop/src/bun/remote/remote-runtime-client.ts", "async streamThread("),
    "server-http": ("apps/server/src/http-server.ts", "assertAuthorized(request"),
    "desktop-generator": ("apps/desktop/src/bun/fs/generator-project.ts", "export"),
    "evaluation-core": ("packages/core/src/thread/evaluation-experiment.ts", "export const EVALUATION_LAB_VERSION"),
    "evaluation-promotion": ("packages/core/src/thread/evaluation-experiment.ts", "export function planEvaluationPromotion"),
    "evaluation-next": ("packages/core/src/thread/evaluation-experiment.ts", "export function createNextEvaluationExperiment"),
    "evaluation-runner": ("apps/web/src/guest/guest-evaluation-runner.ts", "export async function runGuestEvaluationItem"),
    "evaluation-batch": ("apps/web/src/guest/guest-evaluation-lab-dialog.tsx", "const runItems"),
    "evaluation-apply": ("apps/web/src/guest/guest-workbench.tsx", "const applyEvaluationCandidate"),
    "prompt-vars": ("packages/core/src/thread/prompt-variables.ts", "export async function renderThreadPromptVariables"),
    "template-render": ("packages/core/src/thread/template-render.ts", "renderTemplateText"),
    "client-api": ("packages/core/src/client/api.ts", "export async function* streamThread"),
    "client-converters": ("packages/core/src/client/converters.ts", "convertToPiContext"),
    "langgraph": ("packages/core/src/generator/langgraph/index.ts", "export const langgraphGenerator"),
    "python-variables": ("packages/core/src/generator/langgraph/variables.py", "def "),
    "generator-tests": ("packages/core/tests/generator/langgraph/index.test.ts", "test("),
    "remote-server-manager": ("apps/desktop/src/bun/remote/remote-server-manager.ts", "connectServer("),
    "remote-runtime-manager": ("apps/desktop/src/bun/remote/remote-runtime-manager.ts", "registerConfiguredRemoteRuntime"),
    "runtime-router": ("packages/runtime/src/runtime/runtime-router.ts", "export class RuntimeRouter"),
    "server-stream": ("apps/server/src/stream.ts", "export function createStreamResponse"),
    "server-factory": ("apps/server/src/runtime-factory.ts", "export"),
}


def resolve_sources():
    result = {}
    for key, (path, needle) in SOURCES.items():
        raw = (REPO/path).read_bytes()
        lines = raw.decode("utf-8-sig").splitlines()
        matches = [i+1 for i,line in enumerate(lines) if needle in line]
        if not matches:
            raise ValueError(f"Source anchor missing: {path}: {needle}")
        result[key] = {"path":path, "line":matches[0], "anchor":needle,
                       "sha256":hashlib.sha256(raw).hexdigest()}
    return result


def build_html(diagrams, sources):
    lines = ['<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">',
             '<meta name="viewport" content="width=device-width,initial-scale=1">',
             '<title>LLM Space · 架构阅读图册</title>',
             '<style>*{box-sizing:border-box}body{margin:0;font:15px/1.65 "Microsoft YaHei",system-ui,sans-serif;color:#182235;background:#f4f6fa}button,a{touch-action:manipulation}button{font:inherit;cursor:pointer}header{background:#fff;border-bottom:1px solid #dce2eb;padding:23px 30px}h1{font-size:25px;margin:0}header p{margin:6px 0 0;color:#64748b}.layout{display:grid;grid-template-columns:260px minmax(0,1fr);min-height:85vh}nav{padding:20px;background:#fff;border-right:1px solid #dce2eb}nav button{display:block;width:100%;text-align:left;padding:12px;border:0;border-radius:7px;background:transparent;color:#334155;margin-bottom:5px}nav button[aria-current=true]{background:#eaf2ff;color:#1d4ed8;font-weight:600}main{min-width:0;padding:24px}.toolbar{display:flex;gap:9px;align-items:center;flex-wrap:wrap;margin:0 0 15px}.toolbar button,.toolbar a{border:1px solid #cbd5e1;background:#fff;border-radius:6px;padding:5px 12px;color:#1e40af;text-decoration:none}.toolbar output{min-width:54px;color:#64748b}.panel[hidden]{display:none}.viewport{background:white;border:1px solid #dce2eb;border-radius:10px;overflow:auto;max-height:78vh;min-height:240px}.viewport svg{display:block;max-width:none;height:auto}.reading{background:#fff;border:1px solid #dce2eb;border-radius:10px;padding:20px 25px;margin-top:18px}h2{font-size:19px;margin:0 0 12px}h3{font-size:16px;margin:22px 0 8px}li{margin:7px 0}a{color:#1d4ed8}code{overflow-wrap:anywhere;font-size:13px}.source-list{padding-left:20px}button:focus-visible,a:focus-visible{outline:3px solid #60a5fa;outline-offset:2px}.hint{font-size:13px;color:#64748b}footer{padding:16px 30px;color:#64748b} @media(max-width:760px){header{padding:18px}h1{font-size:21px}.layout{display:block}nav{display:flex;overflow-x:auto;border-right:0;padding:12px;gap:8px}nav button{flex:0 0 180px;margin:0}main{padding:12px}.viewport{max-height:65vh}.reading{padding:16px}}@media print{nav,.toolbar,header p{display:none}.layout{display:block}main{padding:0}.panel[hidden]{display:block}.panel{break-before:page}.viewport{max-height:none;overflow:visible;border:0}.viewport svg{width:100%!important}.reading{border:0}.source-list{font-size:11px}}</style></head><body>',
             '<header><h1>LLM Space · 架构阅读图册</h1><p>9 张源码导览图｜2026-09-03｜当前工作树基于 c5fd749｜源码分析，不代表线上验收</p></header>',
             '<div class="layout"><nav aria-label="图表导航">']
    for i,d in enumerate(diagrams):
        lines.append(f'<button type="button" data-index="{i}" aria-current="{str(i==0).lower()}">{esc(d.title)}</button>')
    lines += ['</nav><main><div class="toolbar"><button id="zoom-out" aria-label="缩小图表">− 缩小</button><button id="fit">适合窗口</button><button id="zoom-in" aria-label="放大图表">＋ 放大</button><output id="zoom" aria-live="polite">100%</output><a id="svg-link" href="svg/01-system-architecture.svg" target="_blank" rel="noopener">打开 SVG</a><a id="png-link" href="png/01-system-architecture.png" target="_blank" rel="noopener">打开 PNG</a><a href="README.md">阅读指南</a></div><p class="hint">先选图，再放大查看；图面可横向滚动。所有图表内嵌，可离线打开；源码链接相对于项目目录。</p>']
    for i,d in enumerate(diagrams):
        inline_svg = d.svg().replace(' id="', f' id="{d.slug}-').replace('url(#', f'url(#{d.slug}-').replace('aria-labelledby="diagram-title diagram-desc"', f'aria-labelledby="{d.slug}-diagram-title {d.slug}-diagram-desc"')
        lines.append(f'<section class="panel" id="{d.slug}" data-width="{d.width}"{ " hidden" if i else ""}><div class="viewport" tabindex="0" aria-label="{esc(d.title)}可滚动画布">{inline_svg}</div><div class="reading"><h2>{esc(d.title)}</h2>')
        lines += [f'<p>{esc(note)}</p>' for note in d.notes]
        lines.append('<h3>读图后自检</h3><ul>')
        lines += [f'<li>{esc(q)}</li>' for q in d.questions]
        lines.append('</ul><details><summary>对应源码与当前行号</summary><ul class="source-list">')
        for key in d.refs:
            ref=sources[key]
            lines.append(f'<li><a href="../../{esc(ref["path"])}#L{ref["line"]}"><code>{esc(ref["path"])}</code></a> · L{ref["line"]} · <code>{esc(ref["anchor"])}</code></li>')
        lines.append('</ul></details></div></section>')
    lines += ['</main></div><footer>使用 fireworks-tech-graph · Flat Icon 风格。SVG / PNG / 离线 HTML / 可维护生成器 / 源码指纹。</footer>',
              '<script>"use strict";const panels=[...document.querySelectorAll(".panel")],buttons=[...document.querySelectorAll("nav button")];let current=0,zoom=1;function draw(){const panel=panels[current],viewport=panel.querySelector(".viewport"),svg=panel.querySelector("svg");svg.style.width=(Math.max(240,viewport.clientWidth-2)*zoom)+"px";document.getElementById("zoom").textContent=Math.round(zoom*100)+"%"}function select(index){current=index;panels.forEach((p,i)=>p.hidden=i!==index);buttons.forEach((b,i)=>b.setAttribute("aria-current",String(i===index)));zoom=1;const slug=panels[index].id;document.getElementById("svg-link").href="svg/"+slug+".svg";document.getElementById("png-link").href="png/"+slug+".png";history.replaceState(null,"","#"+slug);draw()}buttons.forEach((b,i)=>b.addEventListener("click",()=>select(i)));document.getElementById("zoom-in").addEventListener("click",()=>{zoom=Math.min(3,zoom+.25);draw()});document.getElementById("zoom-out").addEventListener("click",()=>{zoom=Math.max(.5,zoom-.25);draw()});document.getElementById("fit").addEventListener("click",()=>{zoom=1;draw()});window.addEventListener("resize",draw);const initial=panels.findIndex(p=>"#"+p.id===location.hash);select(initial<0?0:initial);</script></body></html>']
    return "\n".join(lines)


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--skill-root",type=Path)
    parser.add_argument("--no-png",action="store_true")
    parser.add_argument("--check-sources",action="store_true",help="Check recorded source hashes without rewriting artifacts")
    args=parser.parse_args()
    if args.check_sources:
        recorded=json.loads((ROOT/"sources.json").read_text(encoding="utf-8"))
        drift=[]
        for key,ref in recorded["sources"].items():
            p=REPO/ref["path"]
            if not p.exists() or hashlib.sha256(p.read_bytes()).hexdigest()!=ref["sha256"]:
                drift.append(key)
        print(json.dumps({"anchors":len(recorded["sources"]),"changed":drift},ensure_ascii=False))
        return 1 if drift else 0
    sources=resolve_sources()
    diagrams=make_diagrams()
    for name in ["svg","png"]:
        (ROOT/name).mkdir(exist_ok=True)
    checks=[]
    for d in diagrams:
        svg_path=ROOT/"svg"/(d.slug+".svg")
        svg_path.write_text(d.svg(),encoding="utf-8")
        if args.skill_root:
            for check in ["xml","markers","collisions","geometry","composition"]:
                proc=subprocess.run([sys.executable,str(args.skill_root/"scripts"/"validate_svg.py"),str(svg_path),"--check",check],capture_output=True,text=True,encoding="utf-8")
                checks.append({"diagram":d.slug,"check":check,"passed":proc.returncode==0,"details":(proc.stdout+proc.stderr).strip()})
        if not args.no_png:
            import cairosvg
            cairosvg.svg2png(url=str(svg_path),write_to=str(ROOT/"png"/(d.slug+".png")),output_width=d.width*2,output_height=d.height*2)
    (ROOT/"sources.json").write_text(json.dumps({"date":DATE,"sourceCommit":COMMIT,"basis":"current working tree; not deployment evidence","sources":sources,"diagrams":[{"id":d.slug,"title":d.title,"sources":d.refs} for d in diagrams]},ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    (ROOT/"index.html").write_text(build_html(diagrams,sources),encoding="utf-8")
    source_lines=["# 源码证据索引", "", f"核对日期：{DATE}。HEAD 基准：`{COMMIT}`。行号基于当时工作树；精确指纹见 [sources.json](sources.json)。", "", "这些入口用于追踪真实实现；测试文件是阅读与验证入口，不表示本轮已运行对应产品测试。", ""]
    for d in diagrams:
        source_lines += [f"## {d.title}", "", "| 源码 | 定位符 |", "| --- | --- |"]
        for key in d.refs:
            ref=sources[key]
            source_lines.append(f'| [{ref["path"]} · L{ref["line"]}](../../{ref["path"]}#L{ref["line"]}) | `{ref["anchor"]}` |')
        source_lines.append("")
    (ROOT/"SOURCES.md").write_text("\n".join(source_lines).rstrip()+"\n",encoding="utf-8")
    if checks:
        report={"generator":"fireworks-tech-graph / authored Python list method","qualityProfile":"showcase","checks":checks,"visual_review":"pending; see VERIFICATION.md for reviewed artifacts"}
        (ROOT/"validation.json").write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
        failed=[item for item in checks if not item["passed"]]
        print(json.dumps({"diagrams":len(diagrams),"checks":len(checks),"failed":failed},ensure_ascii=False,indent=2))
        if failed:
            return 1
    else:
        print(f"Generated {len(diagrams)} diagrams. Geometry/composition not checked: supply --skill-root.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
