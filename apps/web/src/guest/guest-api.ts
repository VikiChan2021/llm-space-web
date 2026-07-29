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
      const payload = await _readError(response);
      if (payload.quota) onQuotaChanged(payload.quota);
      throw new Error(payload.message);
    }

    const remaining = Number(response.headers.get("X-Guest-Quota-Remaining"));
    if (Number.isFinite(remaining)) {
      onQuotaChanged(null);
    }
    if (!response.body) {
      throw new Error("模型响应为空，请稍后重试。");
    }

    for await (const data of _readSseData(response.body)) {
      if (data === "[START]" || data === "[DONE]") continue;
      yield JSON.parse(data) as AgentEvent;
    }
  };
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

async function _readError(
  response: Response
): Promise<{ message: string; quota?: GuestQuota }> {
  try {
    const payload = (await response.json()) as {
      error?: { message?: unknown };
      quota?: GuestQuota;
    };
    return {
      message:
        typeof payload.error?.message === "string"
          ? payload.error.message
          : "模型服务暂时不可用，请稍后重试。",
      ...(payload.quota ? { quota: payload.quota } : {}),
    };
  } catch {
    return { message: "模型服务暂时不可用，请稍后重试。" };
  }
}

function _apiUrl(path: string): string {
  return `${import.meta.env.BASE_URL}${path}`;
}
