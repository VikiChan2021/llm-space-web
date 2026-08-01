import type { BuiltinTool, McpTool } from "@llm-space/core";

import {
  callGuestBuiltinApi,
  callGuestMcpApi,
  type GuestToolCallResult,
} from "./guest-api";
import {
  findGuestMcpServer,
  isGuestBuiltinMcpServer,
} from "./guest-mcp";
import { readGuestSkill } from "./guest-skills";

const VIRTUAL_WORKSPACE_KEY = "llm-space.guest.virtual-workspace.v1";
const MAX_FILE_CHARS = 100_000;
const MAX_FILES = 100;

interface VirtualWorkspace {
  version: 1;
  files: Record<string, string>;
}

const FILE_SYSTEM_TOOLS: BuiltinTool[] = [
  {
    type: "builtin",
    name: "read",
    icon: "file-text",
    description:
      "读取游客浏览器虚拟工作区中的 UTF-8 文本文件；不会访问设备或服务器真实文件。",
    parameters: _objectParameters(["path"], {
      path: { type: "string", description: "虚拟工作区相对路径。" },
    }),
  },
  {
    type: "builtin",
    name: "write",
    icon: "file-plus",
    description:
      "写入游客浏览器虚拟工作区；需要用户手动点击执行，不会访问真实文件。",
    parameters: _objectParameters(["path", "content"], {
      path: { type: "string", description: "虚拟工作区相对路径。" },
      content: { type: "string", description: "完整文件内容。" },
    }),
  },
  {
    type: "builtin",
    name: "edit",
    icon: "file-pen",
    description:
      "替换虚拟文件中的一段文本；需要用户手动点击执行。",
    parameters: _objectParameters(["path", "old_text", "new_text"], {
      path: { type: "string" },
      old_text: { type: "string" },
      new_text: { type: "string" },
    }),
  },
  {
    type: "builtin",
    name: "ls",
    icon: "folder-open",
    description: "列出游客浏览器虚拟工作区中的文件和目录。",
    parameters: _objectParameters([], {
      path: { type: "string", description: "可选的相对目录。" },
    }),
  },
  {
    type: "builtin",
    name: "tree",
    icon: "list-tree",
    description: "以树状文本列出游客浏览器虚拟工作区。",
    parameters: _objectParameters([], {
      path: { type: "string", description: "可选的相对目录。" },
    }),
  },
  {
    type: "builtin",
    name: "grep",
    icon: "text-search",
    description: "在游客浏览器虚拟工作区的文本文件中搜索字符串。",
    parameters: _objectParameters(["query"], {
      query: { type: "string" },
      path: { type: "string", description: "可选的相对目录或文件。" },
    }),
  },
  {
    type: "builtin",
    name: "glob",
    icon: "asterisk",
    description: "使用 * 和 ** 匹配游客浏览器虚拟工作区路径。",
    parameters: _objectParameters(["pattern"], {
      pattern: { type: "string", description: "例如 **/*.md。" },
    }),
  },
  {
    type: "builtin",
    name: "present_files",
    icon: "files",
    description:
      "读取并汇总一个或多个虚拟文件；需要用户手动点击执行。",
    parameters: _objectParameters(["paths"], {
      paths: {
        type: "array",
        items: { type: "string" },
        description: "最多 10 个虚拟文件相对路径。",
      },
    }),
  },
  {
    type: "builtin",
    name: "bash",
    icon: "terminal",
    description:
      "入口保留：游客 Hosted V1 尚未提供隔离 Shell，调用会返回明确的安全边界说明。",
    parameters: _objectParameters(["command"], {
      command: { type: "string", description: "准备执行的命令。" },
    }),
  },
  {
    type: "builtin",
    name: "skill",
    icon: "sparkles",
    description:
      "读取一个游客内置 Skill 的完整工作流程说明。",
    parameters: _objectParameters(["name"], {
      name: { type: "string", description: "技能名称。" },
    }),
  },
];

const WEB_TOOLS: BuiltinTool[] = [
  {
    type: "builtin",
    name: "web_fetch",
    icon: "globe",
    description:
      "通过受限服务器代理读取一个公开网页，并返回适合模型阅读的 Markdown。",
    parameters: _objectParameters(["url"], {
      url: { type: "string", description: "公开 HTTP(S) 网页地址。" },
    }),
  },
  {
    type: "builtin",
    name: "web_search",
    icon: "search",
    description: "通过受限服务器搜索公开网页，最多返回 8 条结果。",
    parameters: _objectParameters(["query"], {
      query: { type: "string" },
      limit: { type: "number", minimum: 1, maximum: 8 },
    }),
  },
  {
    type: "builtin",
    name: "weather_report",
    icon: "cloud-sun",
    description: "通过受限服务器获取一个地点今天的天气。",
    parameters: _objectParameters(["location"], {
      location: { type: "string" },
    }),
  },
];

const MISC_TOOLS: BuiltinTool[] = [
  {
    type: "builtin",
    name: "todo_write",
    icon: "list-checks",
    description: "把 Todo 列表规范化为可读文本，不写入服务器。",
    parameters: _objectParameters(["todos"], {
      todos: {
        type: "array",
        items: {
          type: "object",
          required: ["content", "status"],
          properties: {
            content: { type: "string" },
            status: {
              type: "string",
              enum: ["pending", "in_progress", "completed"],
            },
          },
        },
      },
    }),
  },
  {
    type: "builtin",
    name: "sleep",
    icon: "clock",
    description: "等待 0-3 秒，用于体验有界的异步工具调用。",
    parameters: _objectParameters(["seconds"], {
      seconds: { type: "number", minimum: 0, maximum: 3 },
    }),
  },
  {
    type: "builtin",
    name: "ask_user_question",
    icon: "message-circle-question",
    description: "向用户提出结构化问题并等待人工选择。",
    terminate: true,
    parameters: _objectParameters(["questions"], {
      questions: {
        type: "array",
        minItems: 1,
        maxItems: 3,
        items: {
          type: "object",
          required: ["question", "options"],
          properties: {
            question: { type: "string" },
            header: { type: "string" },
            multi_select: { type: "boolean" },
            options: {
              type: "array",
              minItems: 1,
              items: {
                type: "object",
                required: ["label"],
                properties: {
                  label: { type: "string" },
                  description: { type: "string" },
                },
              },
            },
          },
        },
      },
    }),
  },
];

export const GUEST_BUILTIN_TOOLS: BuiltinTool[] = [
  ...FILE_SYSTEM_TOOLS,
  ...WEB_TOOLS,
  ...MISC_TOOLS,
];

const AUTO_EXECUTABLE_BUILTINS = new Set([
  "read",
  "ls",
  "tree",
  "grep",
  "glob",
  "web_fetch",
  "web_search",
  "weather_report",
  "skill",
  "todo_write",
  "sleep",
]);

export function canGuestAutoExecute(
  tool: McpTool | BuiltinTool
): boolean {
  if (tool.type === "mcp") {
    return isGuestBuiltinMcpServer(tool.serverId);
  }
  return AUTO_EXECUTABLE_BUILTINS.has(tool.name);
}

export async function executeGuestTool(
  tool: McpTool | BuiltinTool,
  args: Record<string, unknown>,
  workspaceId?: string
): Promise<GuestToolCallResult> {
  if (tool.type === "mcp") {
    const server = findGuestMcpServer(tool.serverId);
    if (!server) {
      throw new Error("MCP 服务器已被删除，请重新添加。");
    }
    return callGuestMcpApi({
      serverId: server.id,
      toolName: tool.toolName,
      arguments: args,
      ...(server.url ? { url: server.url } : {}),
    });
  }
  if (WEB_TOOLS.some((candidate) => candidate.name === tool.name)) {
    return callGuestBuiltinApi(tool.name, args);
  }
  return {
    contentText: await _executeLocalBuiltin(tool.name, args, workspaceId),
    isError: false,
  };
}

async function _executeLocalBuiltin(
  name: string,
  args: Record<string, unknown>,
  workspaceId = "default"
): Promise<string> {
  const workspace = _loadWorkspace(workspaceId);
  switch (name) {
    case "read": {
      const path = _normalizePath(_stringArg(args, "path"));
      const content = workspace.files[path];
      if (content === undefined) throw new Error(`虚拟文件不存在：${path}`);
      return content;
    }
    case "write": {
      const path = _normalizePath(_stringArg(args, "path"));
      const content = _stringArg(args, "content", MAX_FILE_CHARS);
      if (
        workspace.files[path] === undefined &&
        Object.keys(workspace.files).length >= MAX_FILES
      ) {
        throw new Error(`虚拟工作区最多保存 ${MAX_FILES} 个文件。`);
      }
      workspace.files[path] = content;
      _saveWorkspace(workspaceId, workspace);
      return JSON.stringify({ path, characters: content.length });
    }
    case "edit": {
      const path = _normalizePath(_stringArg(args, "path"));
      const oldText = _stringArg(args, "old_text", MAX_FILE_CHARS);
      const newText = _stringArg(args, "new_text", MAX_FILE_CHARS);
      const current = workspace.files[path];
      if (current === undefined) throw new Error(`虚拟文件不存在：${path}`);
      const first = current.indexOf(oldText);
      if (first < 0) throw new Error("old_text 未在虚拟文件中找到。");
      if (current.includes(oldText, first + oldText.length)) {
        throw new Error("old_text 出现多次，请提供更精确的文本。");
      }
      const next = `${current.slice(0, first)}${newText}${current.slice(first + oldText.length)}`;
      if (next.length > MAX_FILE_CHARS) throw new Error("编辑后的文件过大。");
      workspace.files[path] = next;
      _saveWorkspace(workspaceId, workspace);
      return JSON.stringify({ path, characters: next.length });
    }
    case "ls":
      return _listWorkspace(workspace, _optionalPath(args.path), false);
    case "tree":
      return _listWorkspace(workspace, _optionalPath(args.path), true);
    case "grep":
      return _grepWorkspace(
        workspace,
        _stringArg(args, "query", 500),
        _optionalPath(args.path)
      );
    case "glob":
      return _globWorkspace(workspace, _stringArg(args, "pattern", 200));
    case "present_files": {
      const paths = Array.isArray(args.paths)
        ? args.paths
            .slice(0, 10)
            .map((value) =>
              typeof value === "string" ? _normalizePath(value) : ""
            )
            .filter(Boolean)
        : [];
      if (paths.length === 0) throw new Error("paths 至少需要一个路径。");
      return paths
        .map((path) => {
          const content = workspace.files[path];
          return content === undefined
            ? `## ${path}\n[文件不存在]`
            : `## ${path}\n${content}`;
        })
        .join("\n\n");
    }
    case "todo_write": {
      if (!Array.isArray(args.todos)) throw new Error("todos 必须是数组。");
      return args.todos
        .slice(0, 30)
        .map((todo, index) => {
          const record =
            todo && typeof todo === "object"
              ? (todo as Record<string, unknown>)
              : {};
          const status =
            typeof record.status === "string" ? record.status : "pending";
          const content =
            typeof record.content === "string" ? record.content : "";
          return `${index + 1}. [${status}] ${content}`;
        })
        .join("\n");
    }
    case "sleep": {
      const seconds =
        typeof args.seconds === "number" && Number.isFinite(args.seconds)
          ? Math.max(0, Math.min(3, args.seconds))
          : 0;
      await new Promise((resolve) => window.setTimeout(resolve, seconds * 1000));
      return JSON.stringify({ sleptSeconds: seconds });
    }
    case "bash":
      throw new Error(
        "游客 Hosted V1 不会在腾讯云宿主执行 Bash；该入口等待独立隔离沙箱。"
      );
    case "skill":
      return readGuestSkill(args.name);
    default:
      throw new Error(`游客环境不支持执行 ${name}。`);
  }
}

function _loadWorkspace(workspaceId: string): VirtualWorkspace {
  try {
    const parsed = JSON.parse(
      localStorage.getItem(_workspaceKey(workspaceId)) ?? "null"
    ) as VirtualWorkspace | null;
    if (
      parsed?.version === 1 &&
      parsed.files &&
      typeof parsed.files === "object"
    ) {
      return parsed;
    }
  } catch {
    // Fall through to a fresh workspace.
  }
  return {
    version: 1,
    files: {
      "README.md":
        "# 游客虚拟工作区\n\n这里的文件只保存在当前浏览器，不会访问你的设备或腾讯云宿主文件系统。\n",
      "notes/agent-workbench.md":
        "# Agent 工作台体验\n\n你可以让模型读取、搜索或修改这里的示例文件。\n",
    },
  };
}

function _saveWorkspace(
  workspaceId: string,
  workspace: VirtualWorkspace
): void {
  localStorage.setItem(_workspaceKey(workspaceId), JSON.stringify(workspace));
}

function _workspaceKey(workspaceId: string): string {
  return `${VIRTUAL_WORKSPACE_KEY}.${workspaceId.replace(/[^A-Za-z0-9_-]/g, "_")}`;
}

function _normalizePath(value: string): string {
  const normalized = value.trim().replaceAll("\\", "/").replace(/^\.\/+/, "");
  if (
    !normalized ||
    normalized.startsWith("/") ||
    /^[A-Za-z]:/.test(normalized) ||
    normalized.split("/").some((part) => part === "..") ||
    normalized.length > 240
  ) {
    throw new Error("路径必须是虚拟工作区内的安全相对路径。");
  }
  return normalized
    .split("/")
    .filter((part) => part && part !== ".")
    .join("/");
}

function _optionalPath(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value.trim() === ".") {
    return "";
  }
  return _normalizePath(value).replace(/\/+$/, "");
}

function _stringArg(
  args: Record<string, unknown>,
  key: string,
  maximum = 10_000
): string {
  const value = args[key];
  if (typeof value !== "string" || value.length > maximum) {
    throw new Error(`${key} 必须是长度不超过 ${maximum} 的字符串。`);
  }
  return value;
}

function _listWorkspace(
  workspace: VirtualWorkspace,
  base: string,
  recursive: boolean
): string {
  const prefix = base ? `${base}/` : "";
  const entries = new Set<string>();
  for (const path of Object.keys(workspace.files).sort()) {
    if (base && path !== base && !path.startsWith(prefix)) continue;
    const relative = path === base ? path.split("/").at(-1)! : path.slice(prefix.length);
    if (!recursive && relative.includes("/")) {
      entries.add(`${relative.split("/")[0]}/`);
    } else {
      entries.add(relative);
    }
  }
  return [...entries].join("\n") || "[空目录]";
}

function _grepWorkspace(
  workspace: VirtualWorkspace,
  query: string,
  base: string
): string {
  if (!query) throw new Error("query 不能为空。");
  const lines: string[] = [];
  for (const [path, content] of Object.entries(workspace.files)) {
    if (base && path !== base && !path.startsWith(`${base}/`)) continue;
    content.split("\n").forEach((line, index) => {
      if (line.toLowerCase().includes(query.toLowerCase())) {
        lines.push(`${path}:${index + 1}:${line}`);
      }
    });
  }
  return lines.slice(0, 100).join("\n") || "[没有匹配]";
}

function _globWorkspace(
  workspace: VirtualWorkspace,
  pattern: string
): string {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replaceAll("**", "\u0000")
    .replaceAll("*", "[^/]*")
    .replaceAll("\u0000", ".*");
  let expression: RegExp;
  try {
    expression = new RegExp(`^${escaped}$`, "i");
  } catch {
    throw new Error("pattern 格式无效。");
  }
  return (
    Object.keys(workspace.files)
      .filter((path) => expression.test(path))
      .sort()
      .slice(0, 100)
      .join("\n") || "[没有匹配]"
  );
}

function _objectParameters(
  required: string[],
  properties: Record<string, unknown>
): BuiltinTool["parameters"] {
  return {
    type: "object",
    ...(required.length ? { required } : {}),
    properties,
    additionalProperties: false,
  };
}
