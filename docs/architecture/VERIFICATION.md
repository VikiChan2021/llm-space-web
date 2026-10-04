# 图册验收记录

日期：2026-09-03。源码 HEAD 基准：`c5fd749c4ec3d0d1e0d073a635ee361928d1646c`。

## 完成内容

- `svg/`：9 张 SVG，均含文字描述、语义节点、方向明确的连接和图例。
- `png/`：9 张两倍尺寸 PNG，宽度为 3200 像素，工具循环图为 3480 像素。
- `index.html`：内嵌全部 SVG 的离线图册；包含切图、缩放、适合窗口、文件链接和源码折叠区的实现。
- `README.md` / `SOURCES.md` / `sources.json`：阅读顺序、机制解释、53 个源码定位点，覆盖 49 个不同源码文件。
- `build-atlas.py`：Python list-based SVG 生成、CairoSVG 导出、技能验证器调用、源码漂移检查。
- `docs/index.zh-CN.md`：增加图册入口。没有修改应用、共享包、原有 codemap 或已有用户改动。

## SVG 与图像验证

使用 `fireworks-tech-graph/scripts/validate_svg.py` 对每张 SVG 分别运行：

| 检查 | 结果 |
| --- | --- |
| XML 结构 | 9/9 通过 |
| Marker 引用 | 9/9 通过 |
| Arrow / component collisions | 9/9 通过 |
| Semantic geometry | 9/9 通过 |
| Composition，showcase profile | 9/9 通过 |
| CairoSVG 两倍尺寸导出 | 9/9 成功 |
| PNG 人工视觉检查 | 9/9 已查看；中文、边界、文字与箭头通过 |

**visual_review: passed**。范围是 SVG 导出的 PNG，不是 HTML 浏览器交互。查看后对时序标签的生命线遮挡和 Guest 额度连接做了定向修正，再查看对应的最终输出。自动化检查明细见 [validation.json](validation.json)。

## 文档与源码检查

- `mise exec -- python docs/architecture/build-atlas.py --check-sources`：53 个记录定位点的源码 SHA-256 未发生漂移。
- 文档内部链接、HTML 的本地文件链接和唯一 DOM ID 做静态检查。
- HTML 内联 JavaScript 做语法编译检查；图册没有外部脚本、样式、字体请求或 fetch 调用。
- `mise run check:changed`：退出码 0；提示没有需要 lint/typecheck 的已更改 JS/TS 文件。这不是对产品行为的测试。
- `git diff --check -- docs/index.zh-CN.md`：通过。新增图册的结构与链接单独检查。
- `png/` 由此目录的 `.gitignore` 忽略；SVG、HTML、生成器和阅读材料仍可纳入版本控制。未执行 stage、commit、push 或部署。

## 浏览器验证限制

浏览器工具的 URL 安全策略拒绝直接打开 `file:///D:/1_myCode/1-novel/llm-space-web/docs/architecture/index.html`，并明确禁止通过替代浏览器、原始协议或间接方式绕过。此处保留该限制，没有改用本地服务器转发文件来绕过。

因此，**切图、缩放、响应式布局、运行时 console/network 均未做真实浏览器验收**。静态 HTML/JavaScript 检查及 SVG 的 PNG 视觉检查不能替代这些项目。用户可以在默认浏览器手动打开 `index.html` 查看；不需要运行应用或提供凭据。

## 产品证据范围

本轮核对当前源码并交付学习图册，没有运行 Desktop、Guest 模型请求、SSH 连接、OAuth、评测实验或生成的 Python 项目；也没有验证部署状态、实际云数据库或线上可用性。图中 V2、远端运行、工具权限等结论是源码实现描述，不是生产验收结论。
