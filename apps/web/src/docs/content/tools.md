## Built-in Tools

Built-in Tools 由工作台提供执行环境。游客版包含三类：浏览器虚拟文件、受限网络工具和低风险辅助工具。

- `weather_report`：获取一个地点今天的天气。
- `web_search`：搜索公开网页。
- `web_fetch`：读取公开网页并转换为适合模型处理的文本。
- `read`、`write`、`edit` 等：只操作浏览器虚拟工作区，不接触设备或腾讯云真实文件。

Bash 入口保留，但游客版不会在服务器宿主进程中执行任意命令。

## 手动执行 Tool Call

模型生成 Tool Call 后，先检查工具名称与参数。工具有执行后端时，可以点击执行；完成后再次 Run，让模型根据工具 Response 继续回答。

这条手动路径最适合学习和调试，因为每一步都由你确认。

## Custom Function Tool

Custom Tool 用 JSON Schema 告诉模型“存在这样一个函数”，但 Web 游客版不会执行任意自定义代码。模型生成调用后，你可以手工填写 Response，再继续 Run。这适合模拟尚未接入的业务 API。

## MCP

点击 Tools 的 **Add MCP Tools** 可导入两组同源内置 MCP：

- **内置实用工具 MCP**：`calculator`、`current_time`、`json_formatter`、`text_statistics`。
- **内置 Web 研究 MCP**：`web_search`、`web_fetch`、`weather_report`。

这些工具会执行真实计算、文本处理或受限网络请求，不是只用于展示的模拟结果。顶部 **设置 → MCP** 可以查看连接状态和完整工具清单。

## Skills

游客版预装 `deep-research`、`code-review`、`data-analysis` 和 `prompt-engineering`。点击 Variables 的 `available_skills` 可选择要注入 Prompt 的 Skill；给 Thread 添加 `skill` Built-in Tool 后，模型还可以按名称读取完整工作流程。

公共远程 MCP 涉及服务器出站网络、私网访问和认证信息。当前线上只有完成安全隔离的能力才会开放；stdio MCP 不适用于浏览器游客环境。

## 工具没有被调用

- 在 System prompt 明确要求实时信息必须用工具。
- 检查工具是否已经添加到当前 Thread。
- 换一个更明确的问题，例如“调用 weather_report 查询广州今天的天气”。
- 某些模型的工具调用能力或稳定性不同，可以切换模型对比。
