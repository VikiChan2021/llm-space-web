import type {
  AgentEvent,
  AgentTransport,
  ModelProviderGroup,
} from "@llm-space/core";

export const GUEST_PROVIDER_ID = "bigmodel";
export const GUEST_MODEL_ID = "glm-4.7-flash";

export interface GuestQuota {
  model: string;
  browserDailyLimit: number;
  browserRemaining: number;
  ipRemaining: number;
  resetsAt: string;
  byokAvailable: boolean;
}

export interface GuestRunErrorDetails {
  code: string;
  status?: number;
  requestId?: string;
  quota?: GuestQuota;
}

export interface GuestToolCallResult {
  contentText: string;
  isError: boolean;
}

export interface GuestMcpToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export class GuestRunError extends Error {
  readonly code: string;
  readonly status?: number;
  readonly requestId?: string;
  readonly quota?: GuestQuota;

  constructor(message: string, details: GuestRunErrorDetails) {
    super(message);
    this.name = "GuestRunError";
    this.code = details.code;
    this.status = details.status;
    this.requestId = details.requestId;
    this.quota = details.quota;
  }
}

export const GUEST_PROVIDER: ModelProviderGroup = {
  id: GUEST_PROVIDER_ID,
  name: "智谱 BigModel",
  builtin: true,
  apiKeyDetected: true,
  models: [
    {
      id: GUEST_MODEL_ID,
      name: "GLM-4.7-Flash（游客体验）",
      api: "openai-completions",
      provider: GUEST_PROVIDER_ID,
      baseUrl: "https://open.bigmodel.cn/api/paas/v4",
      reasoning: true,
      thinkingLevelMap: {
        off: "disabled",
        minimal: "enabled",
        low: "enabled",
        medium: "enabled",
        high: "enabled",
      },
      input: ["text"],
      cost: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
      },
      contextWindow: 200_000,
      maxTokens: 2_048,
      compat: {
        supportsStore: false,
        supportsDeveloperRole: false,
        supportsReasoningEffort: false,
        supportsUsageInStreaming: true,
        maxTokensField: "max_tokens",
        thinkingFormat: "zai",
      },
    },
  ],
};

export async function readGuestQuota(): Promise<GuestQuota> {
  const response = await fetch(_apiUrl("api/guest/quota"), {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error("暂时无法读取游客额度，请稍后重试。");
  }
  return response.json() as Promise<GuestQuota>;
}

export function createGuestTransport(
  onQuotaChanged: (quota: GuestQuota | null) => void
): AgentTransport {
  return async function* guestTransport(request, { signal }) {
    const response = await fetch(_apiUrl("api/guest/runs"), {
      method: "POST",
      credentials: "same-origin",
      headers: {
        Accept: "text/event-stream",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
      signal,
    });
    if (!response.ok) {
      const error = await readGuestRunError(response);
      if (error.quota) onQuotaChanged(error.quota);
      throw error;
    }

    const remaining = Number(response.headers.get("X-Guest-Quota-Remaining"));
    if (Number.isFinite(remaining)) {
      onQuotaChanged(null);
    }
    if (!response.body) {
      throw new Error("模型响应为空，请稍后重试。");
    }

    for await (const data of _readSseData(response.body)) {
      const event = parseGuestStreamData(data, response);
      if (event) yield event;
    }
  };
}

export function parseGuestStreamData(
  data: string,
  response: Pick<Response, "headers" | "status">
): AgentEvent | null {
  if (data === "[START]" || data === "[DONE]") return null;
  const payload = JSON.parse(data) as unknown;
  if (_isGuestStreamError(payload)) {
    throw new GuestRunError(payload.error.message, {
      code: payload.error.code,
      status: response.status >= 400 ? response.status : undefined,
      requestId:
        payload.error.requestId ??
        response.headers.get("X-Request-Id") ??
        undefined,
    });
  }
  return payload as AgentEvent;
}

async function* _readSseData(
  body: ReadableStream<Uint8Array>
): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done }).replaceAll("\r\n", "\n");
      let separator = buffer.indexOf("\n\n");
      while (separator >= 0) {
        const block = buffer.slice(0, separator);
        buffer = buffer.slice(separator + 2);
        const data = block
          .split("\n")
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trimStart())
          .join("\n");
        if (data) yield data;
        separator = buffer.indexOf("\n\n");
      }
      if (done) break;
    }
  } finally {
    reader.releaseLock();
  }
}

export async function readGuestRunError(
  response: Response
): Promise<GuestRunError> {
  const headerRequestId =
    response.headers.get("X-Request-Id") ?? undefined;
  try {
    const payload = (await response.json()) as {
      error?: {
        code?: unknown;
        message?: unknown;
        requestId?: unknown;
      };
      quota?: GuestQuota;
    };
    return new GuestRunError(
      typeof payload.error?.message === "string"
        ? payload.error.message
        : "模型服务暂时不可用，请稍后重试。",
      {
        code:
          typeof payload.error?.code === "string"
            ? payload.error.code
            : "unknown_error",
        status: response.status,
        requestId:
          typeof payload.error?.requestId === "string"
            ? payload.error.requestId
            : headerRequestId,
        ...(payload.quota ? { quota: payload.quota } : {}),
      }
    );
  } catch {
    return new GuestRunError("模型服务暂时不可用，请稍后重试。", {
      code: "unknown_error",
      status: response.status,
      requestId: headerRequestId,
    });
  }
}

export async function callGuestBuiltinApi(
  name: string,
  args: Record<string, unknown>
): Promise<GuestToolCallResult> {
  return _postGuestJson("/api/guest/tools/call", {
    name,
    arguments: args,
  });
}

export async function listGuestMcpToolsApi(input: {
  serverId: string;
  url?: string;
}): Promise<GuestMcpToolDefinition[]> {
  const result = await _postGuestJson<{
    serverId: string;
    tools: GuestMcpToolDefinition[];
  }>("/api/guest/mcp/tools", input);
  return result.tools;
}

export async function callGuestMcpApi(input: {
  serverId: string;
  url?: string;
  toolName: string;
  arguments: Record<string, unknown>;
}): Promise<GuestToolCallResult> {
  return _postGuestJson("/api/guest/mcp/call", input);
}

async function _postGuestJson<T>(
  path: string,
  body: Record<string, unknown>
): Promise<T> {
  const response = await fetch(_apiUrl(path), {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw await readGuestRunError(response);
  }
  return (await response.json()) as T;
}

function _isGuestStreamError(value: unknown): value is {
  type: "guest_run_error";
  error: { code: string; message: string; requestId?: string };
} {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  if (record.type !== "guest_run_error") return false;
  const error = record.error;
  if (!error || typeof error !== "object") return false;
  const errorRecord = error as Record<string, unknown>;
  return (
    typeof errorRecord.code === "string" &&
    typeof errorRecord.message === "string" &&
    (errorRecord.requestId === undefined ||
      typeof errorRecord.requestId === "string")
  );
}

function _apiUrl(path: string): string {
  return joinGuestApiUrl(import.meta.env.BASE_URL, path);
}

export function joinGuestApiUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}
