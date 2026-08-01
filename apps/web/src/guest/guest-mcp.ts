import {
  buildMcpToolName,
  normalizeMcpName,
  type McpServerToolsResponse,
  type McpServerView,
  type McpToolView,
} from "@llm-space/core";

import { listGuestMcpToolsApi } from "./guest-api";

export const GUEST_DEMO_MCP_ID = "guest-demo-mcp";
export const GUEST_RESEARCH_MCP_ID = "guest-web-research-mcp";
export const OPEN_GUEST_MCP_SETTINGS_EVENT =
  "llm-space:open-guest-mcp-settings";
export const GUEST_MCP_CHANGED_EVENT = "llm-space:guest-mcp-changed";
export const GUEST_REMOTE_MCP_ENABLED =
  import.meta.env.VITE_GUEST_REMOTE_MCP_ENABLED === "1";

const GUEST_MCP_STORAGE_KEY = "llm-space.guest.mcp-servers.v1";
const MAX_GUEST_MCP_SERVERS = 5;
const DEMO_TOOL_SUMMARIES = [
  {
    toolName: "calculator",
    normalizedToolName: "calculator",
    directName: "mcp__demo__calculator",
    description: "Perform one basic arithmetic operation.",
    inputSchema: {
      type: "object",
      required: ["a", "operator", "b"],
      properties: {
        a: { type: "number" },
        operator: { type: "string", enum: ["+", "-", "*", "/"] },
        b: { type: "number" },
      },
      additionalProperties: false,
    },
    requiredFields: ["a", "operator", "b"],
    topLevelProperties: ["a", "operator", "b"],
    available: true,
  },
  {
    toolName: "current_time",
    normalizedToolName: "current_time",
    directName: "mcp__demo__current_time",
    description: "Return the current time in an IANA timezone.",
    inputSchema: {
      type: "object",
      properties: {
        timezone: { type: "string" },
      },
      additionalProperties: false,
    },
    requiredFields: [],
    topLevelProperties: ["timezone"],
    available: true,
  },
  {
    toolName: "json_formatter",
    normalizedToolName: "json_formatter",
    directName: "mcp__utilities__json_formatter",
    description: "Validate and format a JSON string with bounded indentation.",
    inputSchema: {
      type: "object",
      required: ["json"],
      properties: {
        json: { type: "string" },
        indent: { type: "number" },
      },
      additionalProperties: false,
    },
    requiredFields: ["json"],
    topLevelProperties: ["json", "indent"],
    available: true,
  },
  {
    toolName: "text_statistics",
    normalizedToolName: "text_statistics",
    directName: "mcp__utilities__text_statistics",
    description: "Count characters, words and lines in text.",
    inputSchema: {
      type: "object",
      required: ["text"],
      properties: { text: { type: "string" } },
      additionalProperties: false,
    },
    requiredFields: ["text"],
    topLevelProperties: ["text"],
    available: true,
  },
] as const;

const RESEARCH_TOOL_SUMMARIES = [
  {
    toolName: "web_search",
    normalizedToolName: "web_search",
    directName: "mcp__web_research__web_search",
    description: "搜索公开网页并返回最多 8 条结果。",
    inputSchema: {
      type: "object",
      required: ["query"],
      properties: {
        query: { type: "string" },
        limit: { type: "number" },
      },
      additionalProperties: false,
    },
    requiredFields: ["query"],
    topLevelProperties: ["query", "limit"],
    available: true,
  },
  {
    toolName: "web_fetch",
    normalizedToolName: "web_fetch",
    directName: "mcp__web_research__web_fetch",
    description: "读取公开网页并返回适合模型阅读的 Markdown。",
    inputSchema: {
      type: "object",
      required: ["url"],
      properties: { url: { type: "string" } },
      additionalProperties: false,
    },
    requiredFields: ["url"],
    topLevelProperties: ["url"],
    available: true,
  },
  {
    toolName: "weather_report",
    normalizedToolName: "weather_report",
    directName: "mcp__web_research__weather_report",
    description: "获取一个地点今天的天气。",
    inputSchema: {
      type: "object",
      required: ["location"],
      properties: { location: { type: "string" } },
      additionalProperties: false,
    },
    requiredFields: ["location"],
    topLevelProperties: ["location"],
    available: true,
  },
] as const;

export interface GuestMcpServer {
  id: string;
  name: string;
  serverName: string;
  url?: string;
  createdAt: number;
  updatedAt: number;
}

interface GuestMcpStorage {
  version: 1;
  servers: GuestMcpServer[];
}

export function listGuestMcpServers(): McpServerView[] {
  return [
    _demoServerView(),
    _researchServerView(),
    ...(GUEST_REMOTE_MCP_ENABLED
      ? _loadRemoteServers().map((server) => _serverView(server))
      : []),
  ];
}

export function findGuestMcpServer(
  serverId: string
): GuestMcpServer | null {
  if (serverId === GUEST_DEMO_MCP_ID) {
    return {
      id: GUEST_DEMO_MCP_ID,
      name: "内置实用工具 MCP",
      serverName: "utilities",
      createdAt: 0,
      updatedAt: 0,
    };
  }
  if (serverId === GUEST_RESEARCH_MCP_ID) {
    return {
      id: GUEST_RESEARCH_MCP_ID,
      name: "内置 Web 研究 MCP",
      serverName: "web_research",
      createdAt: 0,
      updatedAt: 0,
    };
  }
  return _loadRemoteServers().find((server) => server.id === serverId) ?? null;
}

export async function listGuestMcpTools(
  serverId: string
): Promise<McpServerToolsResponse> {
  const server = findGuestMcpServer(serverId);
  if (!server) {
    throw new Error("MCP 服务器已被删除。");
  }
  const definitions = await listGuestMcpToolsApi({
    serverId: server.id,
    ...(server.url ? { url: server.url } : {}),
  });
  const tools: McpToolView[] = definitions.map((tool) => {
    const normalizedToolName = normalizeMcpName(tool.name) || "tool";
    return {
      serverId: server.id,
      serverName: server.serverName,
      serverDisplayName: server.name,
      toolName: tool.name,
      normalizedToolName,
      directName: buildMcpToolName({
        serverName: server.serverName,
        toolName: normalizedToolName,
      }),
      description: tool.description,
      inputSchema: tool.inputSchema,
      requiredFields: _stringArray(tool.inputSchema.required),
      topLevelProperties: _topLevelProperties(tool.inputSchema),
      available: true,
    };
  });
  const view = _serverView(server, tools);
  return { server: view, tools };
}

export function addGuestMcpServer(input: {
  name: string;
  url: string;
}): GuestMcpServer {
  if (!GUEST_REMOTE_MCP_ENABLED) {
    throw new Error(
      "公共远程 MCP 尚未开放；当前可直接体验同源演示 MCP。"
    );
  }
  const current = _loadRemoteServers();
  if (current.length >= MAX_GUEST_MCP_SERVERS) {
    throw new Error(`游客最多配置 ${MAX_GUEST_MCP_SERVERS} 个远程 MCP。`);
  }
  const name = input.name.trim();
  if (!name || name.length > 60) {
    throw new Error("MCP 名称必须为 1-60 个字符。");
  }
  const url = _normalizePublicMcpUrl(input.url);
  const serverName = normalizeMcpName(name);
  if (!serverName) throw new Error("MCP 名称至少需要一个字母或数字。");
  if (current.some((server) => server.serverName === serverName)) {
    throw new Error("已有同名 MCP，请换一个名称。");
  }
  const now = Date.now();
  const server: GuestMcpServer = {
    id: crypto.randomUUID(),
    name,
    serverName,
    url,
    createdAt: now,
    updatedAt: now,
  };
  _saveRemoteServers([...current, server]);
  return server;
}

export function removeGuestMcpServer(serverId: string): void {
  _saveRemoteServers(
    _loadRemoteServers().filter((server) => server.id !== serverId)
  );
}

function _demoServerView(): McpServerView {
  const server = findGuestMcpServer(GUEST_DEMO_MCP_ID)!;
  return {
    ...server,
    transport: "streamableHttp",
    url: `${location.origin}${import.meta.env.BASE_URL}api/guest/mcp/demo`,
    connected: true,
    toolCount: DEMO_TOOL_SUMMARIES.length,
    readiness: {
      status: "ready",
      testedAt: Date.now(),
      toolCount: DEMO_TOOL_SUMMARIES.length,
      tools: DEMO_TOOL_SUMMARIES.map((tool) => ({
        ...tool,
        inputSchema: { ...tool.inputSchema },
        requiredFields: [...tool.requiredFields],
        topLevelProperties: [...tool.topLevelProperties],
      })),
    },
  };
}

function _researchServerView(): McpServerView {
  const server = findGuestMcpServer(GUEST_RESEARCH_MCP_ID)!;
  return {
    ...server,
    transport: "streamableHttp",
    url: `${location.origin}${import.meta.env.BASE_URL}api/guest/mcp/research`,
    connected: true,
    toolCount: RESEARCH_TOOL_SUMMARIES.length,
    readiness: {
      status: "ready",
      testedAt: Date.now(),
      toolCount: RESEARCH_TOOL_SUMMARIES.length,
      tools: RESEARCH_TOOL_SUMMARIES.map((tool) => ({
        ...tool,
        inputSchema: { ...tool.inputSchema },
        requiredFields: [...tool.requiredFields],
        topLevelProperties: [...tool.topLevelProperties],
      })),
    },
  };
}

export function isGuestBuiltinMcpServer(serverId: string): boolean {
  return (
    serverId === GUEST_DEMO_MCP_ID || serverId === GUEST_RESEARCH_MCP_ID
  );
}

function _serverView(
  server: GuestMcpServer,
  tools: McpToolView[] = []
): McpServerView {
  return {
    ...server,
    transport: "streamableHttp",
    connected: tools.length > 0,
    toolCount: tools.length || null,
    readiness: {
      status: tools.length > 0 ? "ready" : "untested",
      ...(tools.length > 0 ? { testedAt: Date.now() } : {}),
      toolCount: tools.length || null,
      tools: tools.map((tool) => ({
        toolName: tool.toolName,
        normalizedToolName: tool.normalizedToolName,
        directName: tool.directName,
        description: tool.description,
        inputSchema: tool.inputSchema,
        requiredFields: tool.requiredFields,
        topLevelProperties: tool.topLevelProperties,
        available: tool.available,
        ...(tool.disabledReason
          ? { disabledReason: tool.disabledReason }
          : {}),
      })),
    },
  };
}

function _loadRemoteServers(): GuestMcpServer[] {
  try {
    const parsed = JSON.parse(
      localStorage.getItem(GUEST_MCP_STORAGE_KEY) ?? "null"
    ) as GuestMcpStorage | null;
    if (parsed?.version !== 1 || !Array.isArray(parsed.servers)) return [];
    return parsed.servers
      .filter(
        (server) =>
          server &&
          typeof server.id === "string" &&
          typeof server.name === "string" &&
          typeof server.serverName === "string" &&
          typeof server.url === "string"
      )
      .slice(0, MAX_GUEST_MCP_SERVERS);
  } catch {
    return [];
  }
}

function _saveRemoteServers(servers: GuestMcpServer[]): void {
  const value: GuestMcpStorage = { version: 1, servers };
  localStorage.setItem(GUEST_MCP_STORAGE_KEY, JSON.stringify(value));
  window.dispatchEvent(new Event(GUEST_MCP_CHANGED_EVENT));
}

function _normalizePublicMcpUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error("MCP 地址格式无效。");
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.port && url.port !== "443")
  ) {
    throw new Error(
      "游客 MCP 只支持不含凭据、查询参数和片段的标准 HTTPS 地址。"
    );
  }
  return url.toString();
}

function _stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function _topLevelProperties(schema: Record<string, unknown>): string[] {
  const properties = schema.properties;
  return properties && typeof properties === "object" && !Array.isArray(properties)
    ? Object.keys(properties)
    : [];
}
