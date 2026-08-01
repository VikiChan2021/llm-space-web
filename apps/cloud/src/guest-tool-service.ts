import { lookup } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const MAX_TOOL_OUTPUT_CHARS = 20_000;
const MAX_WEB_RESPONSE_BYTES = 512_000;
const MAX_WEB_REDIRECTS = 3;
const MAX_REMOTE_TOOLS = 32;
const MCP_TIMEOUT_MS = 10_000;
const DEMO_MCP_SERVER_ID = "guest-demo-mcp";
const WEB_RESEARCH_MCP_SERVER_ID = "guest-web-research-mcp";

export class GuestToolError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string
  ) {
    super(message);
  }
}

export interface GuestToolDefinition {
  type: "builtin";
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  icon?: string;
  terminate?: boolean;
}

export const GUEST_BUILTIN_TOOLS: GuestToolDefinition[] = [
  {
    type: "builtin",
    name: "web_fetch",
    icon: "globe",
    description:
      "通过受限服务器代理读取一个公开网页，并返回适合模型阅读的 Markdown。",
    parameters: {
      type: "object",
      required: ["url"],
      properties: {
        url: {
          type: "string",
          description: "以 http:// 或 https:// 开头的公开网页 URL。",
        },
      },
      additionalProperties: false,
    },
  },
  {
    type: "builtin",
    name: "web_search",
    icon: "search",
    description: "搜索公开网页并返回最多 8 条结果。",
    parameters: {
      type: "object",
      required: ["query"],
      properties: {
        query: { type: "string", description: "搜索关键词。" },
        limit: {
          type: "number",
          description: "返回条数，范围 1-8，默认 5。",
        },
      },
      additionalProperties: false,
    },
  },
  {
    type: "builtin",
    name: "weather_report",
    icon: "cloud-sun",
    description: "获取一个地点今天的天气。",
    parameters: {
      type: "object",
      required: ["location"],
      properties: {
        location: { type: "string", description: "城市或地点名称。" },
      },
      additionalProperties: false,
    },
  },
];

const DEMO_MCP_TOOLS = [
  {
    name: "calculator",
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
  },
  {
    name: "current_time",
    description: "Return the current time in an IANA timezone.",
    inputSchema: {
      type: "object",
      properties: {
        timezone: {
          type: "string",
          description: "IANA timezone such as Asia/Hong_Kong. Defaults to UTC.",
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "json_formatter",
    description: "Validate and format a JSON string with bounded indentation.",
    inputSchema: {
      type: "object",
      required: ["json"],
      properties: {
        json: { type: "string", description: "JSON text to validate." },
        indent: {
          type: "number",
          description: "Indent size from 0 to 4. Defaults to 2.",
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "text_statistics",
    description: "Count characters, non-whitespace characters, words and lines.",
    inputSchema: {
      type: "object",
      required: ["text"],
      properties: {
        text: { type: "string", description: "Text to analyze." },
      },
      additionalProperties: false,
    },
  },
] as const;

const WEB_RESEARCH_MCP_TOOLS = GUEST_BUILTIN_TOOLS.map((tool) => ({
  name: tool.name,
  description: tool.description,
  inputSchema: tool.parameters,
}));

export function isDemoMcpServer(serverId: string): boolean {
  return serverId === DEMO_MCP_SERVER_ID;
}

export function isBuiltinGuestMcpServer(serverId: string): boolean {
  return (
    serverId === DEMO_MCP_SERVER_ID ||
    serverId === WEB_RESEARCH_MCP_SERVER_ID
  );
}

export function getDemoMcpServerId(): string {
  return DEMO_MCP_SERVER_ID;
}

export function listDemoMcpTools() {
  return DEMO_MCP_TOOLS.map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
  }));
}

export function listBuiltinGuestMcpTools(serverId: string) {
  if (serverId === DEMO_MCP_SERVER_ID) return listDemoMcpTools();
  if (serverId === WEB_RESEARCH_MCP_SERVER_ID) {
    return WEB_RESEARCH_MCP_TOOLS.map((tool) => ({ ...tool }));
  }
  throw new GuestToolError(404, "mcp_server_not_found", "内置 MCP 不存在。");
}

export async function callGuestBuiltinTool(
  name: string,
  args: Record<string, unknown>
): Promise<string> {
  switch (name) {
    case "weather_report":
      return _weatherReport(_requireString(args, "location"));
    case "web_search":
      return _webSearch(
        _requireString(args, "query"),
        _boundedInteger(args.limit, 5, 1, 8)
      );
    case "web_fetch":
      return _webFetch(_requirePublicWebUrl(args, "url"));
    default:
      throw new GuestToolError(
        400,
        "unsupported_tool",
        "该 Built-in Tool 不在游客服务器允许列表中。"
      );
  }
}

export async function listRemoteMcpTools(urlText: string) {
  return _withRemoteMcp(urlText, async (client) => {
    const response = await client.listTools(undefined, {
      timeout: MCP_TIMEOUT_MS,
    });
    return response.tools.slice(0, MAX_REMOTE_TOOLS).map((tool) => ({
      name: tool.name,
      description: tool.description ?? "",
      inputSchema: _boundedSchema(tool.inputSchema),
    }));
  });
}

export async function callGuestMcpTool(input: {
  serverId: string;
  url?: string;
  toolName: string;
  arguments: Record<string, unknown>;
}): Promise<{ contentText: string; isError: boolean }> {
  _assertArguments(input.arguments);
  if (input.serverId === DEMO_MCP_SERVER_ID) {
    return {
      contentText: _callDemoMcpTool(input.toolName, input.arguments),
      isError: false,
    };
  }
  if (input.serverId === WEB_RESEARCH_MCP_SERVER_ID) {
    return {
      contentText: await callGuestBuiltinTool(
        input.toolName,
        input.arguments
      ),
      isError: false,
    };
  }
  if (!input.url) {
    throw new GuestToolError(
      400,
      "invalid_mcp_server",
      "缺少远程 MCP 地址。"
    );
  }
  return _withRemoteMcp(input.url, async (client) => {
    const response = await client.callTool(
      {
        name: input.toolName,
        arguments: input.arguments,
      },
      undefined,
      { timeout: MCP_TIMEOUT_MS }
    );
    return {
      contentText: _mcpContentText(response.content),
      isError: response.isError === true,
    };
  });
}

async function _weatherReport(location: string): Promise<string> {
  const encoded = location
    .trim()
    .split(/\s+/)
    .map(encodeURIComponent)
    .join("+");
  const response = await _fixedFetch(
    `https://wttr.in/${encoded}?format=j1&lang=zh`,
    {
      headers: {
        Accept: "application/json",
        "User-Agent": "llm-space-guest-weather/1.0",
      },
    }
  );
  if (!response.ok) {
    throw new GuestToolError(
      502,
      "tool_upstream_error",
      `天气服务返回 ${response.status}。`
    );
  }
  const value = (await response.json()) as {
    current_condition?: {
      temp_C?: string;
      FeelsLikeC?: string;
      humidity?: string;
      weatherDesc?: { value?: string }[];
    }[];
    weather?: { date?: string; maxtempC?: string; mintempC?: string }[];
  };
  const current = value.current_condition?.[0];
  const today = value.weather?.[0];
  return _truncate(
    JSON.stringify(
      {
        location,
        date: today?.date,
        description: current?.weatherDesc?.[0]?.value ?? "Unknown",
        temperatureC: current?.temp_C,
        feelsLikeC: current?.FeelsLikeC,
        humidityPercent: current?.humidity,
        maxC: today?.maxtempC,
        minC: today?.mintempC,
      },
      null,
      2
    )
  );
}

async function _webSearch(query: string, limit: number): Promise<string> {
  const searchUrl = new URL("https://cn.bing.com/search");
  searchUrl.searchParams.set("q", query);
  const response = await _fixedFetch(searchUrl.toString(), {
    headers: {
      Accept: "text/html",
      "User-Agent": "Mozilla/5.0 (compatible; LLM-Space-Guest/1.0)",
    },
  });
  if (!response.ok) {
    throw new GuestToolError(
      response.status === 429 ? 429 : 502,
      response.status === 429 ? "tool_daily_limit" : "tool_upstream_error",
      `搜索服务返回 ${response.status}。`
    );
  }
  const html = await response.text();
  const results = _parseBingResults(html, limit);
  if (results.length === 0) {
    throw new GuestToolError(
      502,
      "tool_upstream_error",
      "搜索服务没有返回可解析的结果。"
    );
  }
  return _truncate(
    JSON.stringify(results, null, 2)
  );
}

async function _webFetch(url: URL): Promise<string> {
  const response = await _safePublicWebRequest(url);
  if (response.status < 200 || response.status >= 300) {
    throw new GuestToolError(
      response.status === 429 ? 429 : 502,
      response.status === 429 ? "tool_daily_limit" : "tool_upstream_error",
      `网页读取服务返回 ${response.status}。`
    );
  }
  const content = response.contentType.toLowerCase().includes("text/html")
    ? _htmlToReadableText(response.body)
    : response.body;
  return _truncate(`URL: ${response.url.toString()}\n\n${content.trim()}`);
}

function _parseBingResults(
  html: string,
  limit: number
): { title: string; url: string; snippet: string }[] {
  const results: { title: string; url: string; snippet: string }[] = [];
  const pattern =
    /<h2[^>]*>\s*<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>\s*<\/h2>[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/gi;
  for (const match of html.matchAll(pattern)) {
    const target = _decodeBingResultUrl(_decodeHtml(match[1] ?? ""));
    let parsedTarget: URL;
    try {
      parsedTarget = new URL(target);
    } catch {
      continue;
    }
    if (
      parsedTarget.protocol !== "http:" &&
      parsedTarget.protocol !== "https:"
    ) {
      continue;
    }
    results.push({
      title: _htmlText(match[2] ?? "") || "Untitled",
      url: parsedTarget.toString(),
      snippet: _htmlText(match[3] ?? ""),
    });
    if (results.length >= limit) break;
  }
  return results;
}

function _decodeBingResultUrl(value: string): string {
  try {
    const redirect = new URL(value, "https://cn.bing.com");
    const encoded = redirect.searchParams.get("u");
    if (encoded?.startsWith("a1")) {
      return Buffer.from(encoded.slice(2), "base64url").toString("utf8");
    }
    return redirect.toString();
  } catch {
    return value;
  }
}

function _htmlToReadableText(html: string): string {
  return _decodeHtml(
    html
      .replace(/<(script|style|noscript|svg)[^>]*>[\s\S]*?<\/\1>/gi, " ")
      .replace(/<br\s*\/?\s*>/gi, "\n")
      .replace(
        /<\/\s*(h[1-6]|p|div|section|article|main|header|footer|li)>/gi,
        "\n"
      )
      .replace(/<li[^>]*>/gi, "- ")
      .replace(/<[^>]*>/g, " ")
  )
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function _htmlText(value: string): string {
  return _decodeHtml(value.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function _decodeHtml(value: string): string {
  return value.replace(
    /&(#x[0-9a-f]+|#\d+|amp|quot|apos|lt|gt|nbsp);/gi,
    (entity, code: string) => {
      const normalized = code.toLowerCase();
      if (normalized.startsWith("#x")) {
        return String.fromCodePoint(Number.parseInt(normalized.slice(2), 16));
      }
      if (normalized.startsWith("#")) {
        return String.fromCodePoint(Number.parseInt(normalized.slice(1), 10));
      }
      return (
        {
          amp: "&",
          quot: '"',
          apos: "'",
          lt: "<",
          gt: ">",
          nbsp: " ",
        }[normalized] ?? entity
      );
    }
  );
}

interface SafeWebResponse {
  status: number;
  contentType: string;
  body: string;
  url: URL;
}

async function _safePublicWebRequest(
  url: URL,
  redirectCount = 0
): Promise<SafeWebResponse> {
  const target = _validatePublicWebUrl(url);
  const host = target.hostname.replace(/^\[|\]$/g, "");
  let addresses: { address: string; family: number }[];
  try {
    addresses = isIP(host)
      ? [{ address: host, family: isIP(host) }]
      : await lookup(host, { all: true, verbatim: true });
  } catch {
    throw new GuestToolError(400, "tool_dns_error", "无法解析网页地址。");
  }
  if (
    addresses.length === 0 ||
    addresses.some((entry) => _isPrivateIp(entry.address))
  ) {
    throw new GuestToolError(
      400,
      "private_tool_url",
      "url 不能指向本机、私网或云元数据服务。"
    );
  }
  const selected =
    addresses.find((entry) => entry.family === 4) ?? addresses[0];
  const response = await _requestPinnedAddress(target, selected);
  if (
    response.status >= 300 &&
    response.status < 400 &&
    response.location
  ) {
    if (redirectCount >= MAX_WEB_REDIRECTS) {
      throw new GuestToolError(
        502,
        "tool_upstream_error",
        "网页重定向次数过多。"
      );
    }
    return _safePublicWebRequest(
      new URL(response.location, target),
      redirectCount + 1
    );
  }
  return {
    status: response.status,
    contentType: response.contentType,
    body: response.body,
    url: target,
  };
}

function _requestPinnedAddress(
  url: URL,
  address: { address: string; family: number }
): Promise<{
  status: number;
  contentType: string;
  location?: string;
  body: string;
}> {
  return new Promise((resolve, reject) => {
    const request = (url.protocol === "https:" ? httpsRequest : httpRequest)(
      url,
      {
        headers: {
          Accept:
            "text/html,text/plain,application/json,application/xml;q=0.9,*/*;q=0.5",
          "Accept-Encoding": "identity",
          "User-Agent": "Mozilla/5.0 (compatible; LLM-Space-Guest/1.0)",
        },
        lookup: (_hostname, _options, callback) => {
          if (typeof _options === "object" && _options.all) {
            callback(null, [address]);
            return;
          }
          callback(null, address.address, address.family);
        },
      },
      (response) => {
        const chunks: Buffer[] = [];
        let bytes = 0;
        response.on("data", (chunk: Buffer | string) => {
          const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          bytes += buffer.length;
          if (bytes > MAX_WEB_RESPONSE_BYTES) {
            request.destroy(new Error("response_too_large"));
            return;
          }
          chunks.push(buffer);
        });
        response.on("end", () => {
          resolve({
            status: response.statusCode ?? 502,
            contentType:
              typeof response.headers["content-type"] === "string"
                ? response.headers["content-type"]
                : "",
            ...(typeof response.headers.location === "string"
              ? { location: response.headers.location }
              : {}),
            body: Buffer.concat(chunks).toString("utf8"),
          });
        });
      }
    );
    request.setTimeout(MCP_TIMEOUT_MS, () => {
      request.destroy(new Error("request_timeout"));
    });
    request.on("error", (error) => {
      reject(
        new GuestToolError(
          error.message === "response_too_large" ? 413 : 502,
          error.message === "response_too_large"
            ? "tool_output_too_large"
            : "tool_upstream_error",
          error.message === "response_too_large"
            ? "网页响应过大。"
            : "工具依赖的外部服务暂时不可用。"
        )
      );
    });
    request.end();
  });
}

function _callDemoMcpTool(
  name: string,
  args: Record<string, unknown>
): string {
  if (name === "calculator") {
    const a = _requireNumber(args, "a");
    const b = _requireNumber(args, "b");
    const operator = _requireString(args, "operator");
    if (!["+", "-", "*", "/"].includes(operator)) {
      throw new GuestToolError(
        400,
        "invalid_tool_arguments",
        "operator 必须是 +、-、* 或 /。"
      );
    }
    if (operator === "/" && b === 0) {
      throw new GuestToolError(
        400,
        "invalid_tool_arguments",
        "不能除以 0。"
      );
    }
    const result =
      operator === "+"
        ? a + b
        : operator === "-"
          ? a - b
          : operator === "*"
            ? a * b
            : a / b;
    return JSON.stringify({ expression: `${a} ${operator} ${b}`, result });
  }
  if (name === "current_time") {
    const timezone =
      typeof args.timezone === "string" && args.timezone.trim()
        ? args.timezone.trim()
        : "UTC";
    let formatted: string;
    try {
      formatted = new Intl.DateTimeFormat("zh-CN", {
        dateStyle: "full",
        timeStyle: "long",
        timeZone: timezone,
      }).format(new Date());
    } catch {
      throw new GuestToolError(
        400,
        "invalid_tool_arguments",
        "timezone 必须是有效的 IANA 时区。"
      );
    }
    return JSON.stringify({ timezone, time: formatted });
  }
  if (name === "json_formatter") {
    const json = _requireString(args, "json");
    if (json.length > 12_000) {
      throw new GuestToolError(
        413,
        "invalid_tool_arguments",
        "json 不能超过 12000 个字符。"
      );
    }
    let value: unknown;
    try {
      value = JSON.parse(json);
    } catch {
      throw new GuestToolError(
        400,
        "invalid_tool_arguments",
        "json 不是有效的 JSON 文本。"
      );
    }
    const indent = _boundedInteger(args.indent, 2, 0, 4);
    return JSON.stringify({ valid: true, formatted: JSON.stringify(value, null, indent) });
  }
  if (name === "text_statistics") {
    const text = _requireString(args, "text");
    if (text.length > 12_000) {
      throw new GuestToolError(
        413,
        "invalid_tool_arguments",
        "text 不能超过 12000 个字符。"
      );
    }
    return JSON.stringify({
      characters: [...text].length,
      nonWhitespaceCharacters: [...text].filter((character) => !/\s/u.test(character)).length,
      words: text.trim() ? text.trim().split(/\s+/u).length : 0,
      lines: text ? text.split(/\r?\n/u).length : 0,
    });
  }
  throw new GuestToolError(
    400,
    "unsupported_tool",
    "演示 MCP 中不存在该工具。"
  );
}

async function _withRemoteMcp<T>(
  urlText: string,
  run: (client: Client) => Promise<T>
): Promise<T> {
  const url = await assertPublicHttpsMcpUrl(urlText);
  const safeFetch = async (
    input: string | URL | Request,
    init?: RequestInit
  ): Promise<Response> => {
    const inputUrl =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    const target = await assertPublicHttpsMcpUrl(inputUrl);
    return fetch(target, {
      ...init,
      redirect: "manual",
      signal: AbortSignal.timeout(MCP_TIMEOUT_MS),
    });
  };
  const transport = new StreamableHTTPClientTransport(url, {
    fetch: safeFetch,
    reconnectionOptions: {
      maxReconnectionDelay: 1000,
      initialReconnectionDelay: 250,
      reconnectionDelayGrowFactor: 1.5,
      maxRetries: 0,
    },
  });
  const client = new Client({
    name: "llm-space-guest",
    version: "1.0.0",
  });
  try {
    await client.connect(transport);
    return await run(client);
  } catch (error) {
    if (error instanceof GuestToolError) {
      throw error;
    }
    const message =
      error instanceof Error && /timed? ?out|abort/i.test(error.message)
        ? "远程 MCP 连接超时。"
        : "远程 MCP 无法连接或协议不兼容。";
    throw new GuestToolError(502, "mcp_unavailable", message);
  } finally {
    await client.close().catch(() => undefined);
  }
}

export async function assertPublicHttpsMcpUrl(urlText: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(urlText);
  } catch {
    throw new GuestToolError(
      400,
      "invalid_mcp_url",
      "MCP 地址格式无效。"
    );
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.port && url.port !== "443")
  ) {
    throw new GuestToolError(
      400,
      "invalid_mcp_url",
      "游客 MCP 只支持不含凭据、查询参数和片段的标准 HTTPS 地址。"
    );
  }
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host === "metadata.google.internal"
  ) {
    throw new GuestToolError(
      400,
      "private_mcp_url",
      "MCP 地址不能指向本机、私网或云元数据服务。"
    );
  }
  const directIp = isIP(host);
  if (directIp) {
    if (_isPrivateIp(host)) {
      throw new GuestToolError(
        400,
        "private_mcp_url",
        "MCP 地址不能指向本机、私网或云元数据服务。"
      );
    }
    return url;
  }
  let addresses: { address: string; family: number }[];
  try {
    addresses = await lookup(host, { all: true, verbatim: true });
  } catch {
    throw new GuestToolError(
      400,
      "mcp_dns_error",
      "无法解析 MCP 服务器域名。"
    );
  }
  if (
    addresses.length === 0 ||
    addresses.some((entry) => _isPrivateIp(entry.address))
  ) {
    throw new GuestToolError(
      400,
      "private_mcp_url",
      "MCP 地址不能解析到本机、私网或云元数据服务。"
    );
  }
  return url;
}

function _isPrivateIp(address: string): boolean {
  const normalized = address.toLowerCase().replace(/^::ffff:/, "");
  if (normalized.includes(":")) {
    return (
      normalized === "::" ||
      normalized === "::1" ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      /^fe[89ab]/.test(normalized)
    );
  }
  const parts = normalized.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) {
    return true;
  }
  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19))
  );
}

function _requireString(
  args: Record<string, unknown>,
  key: string
): string {
  const value = args[key];
  if (typeof value !== "string" || !value.trim() || value.length > 2_000) {
    throw new GuestToolError(
      400,
      "invalid_tool_arguments",
      `${key} 必须是非空字符串。`
    );
  }
  return value.trim();
}

function _requireNumber(
  args: Record<string, unknown>,
  key: string
): number {
  const value = args[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new GuestToolError(
      400,
      "invalid_tool_arguments",
      `${key} 必须是有限数字。`
    );
  }
  return value;
}

function _requirePublicWebUrl(
  args: Record<string, unknown>,
  key: string
): URL {
  const value = _requireString(args, key);
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new GuestToolError(
      400,
      "invalid_tool_arguments",
      "url 格式无效。"
    );
  }
  return _validatePublicWebUrl(url);
}

function _validatePublicWebUrl(url: URL): URL {
  if (
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    url.username ||
    url.password ||
    (url.port && url.port !== "80" && url.port !== "443")
  ) {
    throw new GuestToolError(
      400,
      "invalid_tool_arguments",
      "url 必须是公开的 HTTP(S) 地址，且不能包含凭据。"
    );
  }
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host === "metadata.google.internal"
  ) {
    throw new GuestToolError(
      400,
      "private_tool_url",
      "url 不能指向本机、私网或云元数据服务。"
    );
  }
  if (isIP(host)) {
    if (_isPrivateIp(host)) {
      throw new GuestToolError(
        400,
        "private_tool_url",
        "url 不能指向本机、私网或云元数据服务。"
      );
    }
    return url;
  }
  return url;
}

function _boundedInteger(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number
): number {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || (value as number) < minimum) {
    throw new GuestToolError(
      400,
      "invalid_tool_arguments",
      `数字参数必须在 ${minimum}-${maximum} 之间。`
    );
  }
  return Math.min(maximum, value as number);
}

function _assertArguments(value: Record<string, unknown>): void {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    JSON.stringify(value).length > 16_000
  ) {
    throw new GuestToolError(
      400,
      "invalid_tool_arguments",
      "工具参数格式无效或过大。"
    );
  }
}

function _boundedSchema(value: unknown): Record<string, unknown> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    JSON.stringify(value).length > 16_000
  ) {
    return { type: "object", properties: {}, additionalProperties: false };
  }
  return value as Record<string, unknown>;
}

function _mcpContentText(content: unknown): string {
  if (!Array.isArray(content)) {
    return _truncate(JSON.stringify(content ?? null));
  }
  return _truncate(
    content
      .map((item) => {
        if (
          item &&
          typeof item === "object" &&
          (item as { type?: unknown }).type === "text" &&
          typeof (item as { text?: unknown }).text === "string"
        ) {
          return (item as { text: string }).text;
        }
        return JSON.stringify(item);
      })
      .join("\n")
  );
}

function _truncate(value: string): string {
  return value.length <= MAX_TOOL_OUTPUT_CHARS
    ? value
    : `${value.slice(0, MAX_TOOL_OUTPUT_CHARS)}\n\n[输出已截断]`;
}

async function _fixedFetch(
  input: string,
  init?: RequestInit
): Promise<Response> {
  try {
    return await fetch(input, {
      ...init,
      redirect: "error",
      signal: AbortSignal.timeout(MCP_TIMEOUT_MS),
    });
  } catch {
    throw new GuestToolError(
      502,
      "tool_upstream_error",
      "工具依赖的外部服务暂时不可用。"
    );
  }
}
