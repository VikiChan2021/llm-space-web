import { randomBytes } from "node:crypto";

import type { AgentEvent } from "@earendil-works/pi-agent-core";
import type { AgentStreamRequest } from "@llm-space/core/types";

import { readCookie, serializeCookie } from "./cookies";
import type { GuestCloudConfig } from "./guest-config";
import type {
  GuestQuotaDecision,
  GuestQuotaStore,
} from "./guest-quota";

const GUEST_COOKIE = "llm_space_guest";
const MAX_MESSAGES = 40;

export type GuestModelExecutor = (
  request: AgentStreamRequest,
  signal: AbortSignal
) => AsyncIterable<AgentEvent>;

export interface GuestHttpDependencies {
  config: GuestCloudConfig;
  quotaStore: Pick<
    GuestQuotaStore,
    "hashIdentity" | "read" | "consume"
  >;
  execute: GuestModelExecutor;
  now?: () => Date;
}

export function startGuestHttpServer(
  dependencies: GuestHttpDependencies
): Bun.Server<unknown> {
  return Bun.serve({
    hostname: dependencies.config.host,
    port: dependencies.config.port,
    fetch: createGuestFetchHandler(dependencies),
  });
}

export function createGuestFetchHandler(
  dependencies: GuestHttpDependencies
) {
  const now = dependencies.now ?? (() => new Date());
  const activeRuns = new Map<string, number>();

  return async function guestFetchHandler(request: Request): Promise<Response> {
    try {
      const url = new URL(request.url);
      if (request.method === "GET" && url.pathname === "/health") {
        return _json({
          ok: true,
          service: "llm-space-guest-api",
          model: dependencies.config.modelId,
        });
      }
      if (request.method === "GET" && url.pathname === "/api/guest/quota") {
        const identity = _guestIdentity(request, dependencies.config);
        const quota = dependencies.quotaStore.read(
          identity.id,
          _sourceIp(request, dependencies.config),
          now(),
          dependencies.config.browserDailyLimit,
          dependencies.config.ipDailyLimit
        );
        return _json(_publicQuota(quota, dependencies.config), {
          headers: identity.setCookie
            ? { "Set-Cookie": identity.setCookie }
            : undefined,
        });
      }
      if (request.method === "POST" && url.pathname === "/api/guest/runs") {
        _assertSameOrigin(request, dependencies.config.publicUrl);
        _assertJsonRequest(request);
        const identity = _guestIdentity(request, dependencies.config);
        const guestHash = dependencies.quotaStore.hashIdentity(
          "guest",
          identity.id
        );
        const active = activeRuns.get(guestHash) ?? 0;
        if (active >= dependencies.config.maxConcurrentPerGuest) {
          throw new GuestHttpError(
            429,
            "guest_concurrency_limit",
            "当前已有一次模型运行，请先停止或等待它完成。"
          );
        }

        const requestBody = await _readRequest(
          request,
          dependencies.config
        );
        const quota = dependencies.quotaStore.consume({
          guestId: identity.id,
          ip: _sourceIp(request, dependencies.config),
          now: now(),
          browserDailyLimit: dependencies.config.browserDailyLimit,
          ipDailyLimit: dependencies.config.ipDailyLimit,
        });
        if (!quota.allowed) {
          throw new GuestHttpError(
            429,
            "guest_daily_limit",
            "今日免费体验额度已用完。BYOK 即将开放，届时可使用自己的 API Key 继续运行。",
            quota
          );
        }

        activeRuns.set(guestHash, active + 1);
        const response = _streamResponse(
          dependencies.execute(requestBody, request.signal),
          () => {
            const next = (activeRuns.get(guestHash) ?? 1) - 1;
            if (next <= 0) activeRuns.delete(guestHash);
            else activeRuns.set(guestHash, next);
          },
          quota,
          dependencies.config
        );
        if (identity.setCookie) {
          response.headers.append("Set-Cookie", identity.setCookie);
        }
        return response;
      }
      return _json(
        {
          ok: false,
          error: { code: "not_found", message: "Endpoint not found." },
        },
        { status: 404 }
      );
    } catch (error) {
      const known =
        error instanceof GuestHttpError
          ? error
          : new GuestHttpError(
              500,
              "internal_error",
              "请求暂时无法完成，请稍后重试。"
            );
      if (!(error instanceof GuestHttpError)) {
        console.error(
          "Guest request failed.",
          error instanceof Error ? error.name : "UnknownError"
        );
      }
      return _json(
        {
          ok: false,
          error: { code: known.code, message: known.message },
          ...(known.quota
            ? { quota: _publicQuota(known.quota, dependencies.config) }
            : {}),
        },
        { status: known.status }
      );
    }
  };
}

class GuestHttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly quota?: GuestQuotaDecision
  ) {
    super(message);
  }
}

async function _readRequest(
  request: Request,
  config: GuestCloudConfig
): Promise<AgentStreamRequest> {
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > config.maxRequestBytes
  ) {
    throw new GuestHttpError(
      413,
      "request_too_large",
      "当前 Thread 内容过长，请缩短后重试。"
    );
  }
  const text = await request.text();
  if (Buffer.byteLength(text, "utf8") > config.maxRequestBytes) {
    throw new GuestHttpError(
      413,
      "request_too_large",
      "当前 Thread 内容过长，请缩短后重试。"
    );
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new GuestHttpError(
      400,
      "invalid_json",
      "请求格式无效。"
    );
  }
  _validateRequest(value, config);
  return value;
}

function _validateRequest(
  value: unknown,
  config: GuestCloudConfig
): asserts value is AgentStreamRequest {
  if (typeof value !== "object" || value === null) {
    throw new GuestHttpError(400, "invalid_request", "请求格式无效。");
  }
  const request = value as Partial<AgentStreamRequest>;
  const context = request.context;
  if (
    !context ||
    !Array.isArray(context.messages) ||
    context.messages.length === 0 ||
    context.messages.length > MAX_MESSAGES ||
    !Array.isArray(context.tools) ||
    context.tools.length !== 0
  ) {
    throw new GuestHttpError(
      400,
      "invalid_context",
      "游客体验只支持模型对话，暂不开放工具运行。"
    );
  }
  const last = context.messages.at(-1);
  if (last?.role !== "user") {
    throw new GuestHttpError(
      400,
      "invalid_conversation",
      "最后一条消息必须来自用户。"
    );
  }
  let characters =
    typeof context.systemPrompt === "string"
      ? context.systemPrompt.length
      : 0;
  for (const message of context.messages) {
    if (
      !message ||
      (message.role !== "user" && message.role !== "assistant") ||
      !Array.isArray(message.content)
    ) {
      throw new GuestHttpError(
        400,
        "unsupported_message",
        "游客体验暂时只支持文本对话。"
      );
    }
    for (const content of message.content) {
      if (
        !content ||
        (content.type !== "text" && content.type !== "thinking")
      ) {
        throw new GuestHttpError(
          400,
          "unsupported_content",
          "游客体验暂时只支持文本内容。"
        );
      }
      characters +=
        content.type === "text"
          ? content.text.length
          : content.thinking.length;
    }
  }
  if (characters > config.maxTextCharacters) {
    throw new GuestHttpError(
      413,
      "text_limit",
      `游客体验单次最多支持 ${config.maxTextCharacters} 个文本字符。`
    );
  }
}

function _streamResponse(
  events: AsyncIterable<AgentEvent>,
  release: () => void,
  quota: GuestQuotaDecision,
  config: GuestCloudConfig
): Response {
  const encoder = new TextEncoder();
  let released = false;
  const finish = () => {
    if (released) return;
    released = true;
    release();
  };
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        controller.enqueue(encoder.encode("data: [START]\n\n"));
        for await (const event of events) {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
          );
        }
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      } catch (error) {
        controller.error(
          error instanceof Error
            ? new Error("模型服务暂时不可用，请稍后重试。")
            : error
        );
      } finally {
        finish();
      }
    },
    cancel() {
      finish();
    },
  });
  const headers = _securityHeaders();
  headers.set("Content-Type", "text/event-stream; charset=utf-8");
  headers.set("Connection", "keep-alive");
  headers.set("X-Accel-Buffering", "no");
  _setQuotaHeaders(headers, quota, config);
  return new Response(body, { headers });
}

function _guestIdentity(
  request: Request,
  config: GuestCloudConfig
): { id: string; setCookie: string | null } {
  const cookieName = _cookieName(config.secureCookies);
  const existing = readCookie(request, cookieName);
  if (existing && /^[A-Za-z0-9_-]{32,128}$/.test(existing)) {
    return { id: existing, setCookie: null };
  }
  const id = randomBytes(32).toString("base64url");
  return {
    id,
    setCookie: serializeCookie(cookieName, id, {
      httpOnly: true,
      sameSite: "Lax",
      secure: config.secureCookies,
      maxAgeSeconds: 60 * 60 * 24 * 365,
    }),
  };
}

function _cookieName(secure: boolean): string {
  return secure ? `__Host-${GUEST_COOKIE}` : GUEST_COOKIE;
}

function _sourceIp(request: Request, config: GuestCloudConfig): string {
  if (!config.trustProxy) return "direct";
  const forwarded = request.headers.get("x-real-ip")?.trim();
  return forwarded && forwarded.length <= 128 ? forwarded : "unknown";
}

function _assertSameOrigin(request: Request, publicUrl: URL): void {
  const origin = request.headers.get("origin");
  if (!origin || origin !== publicUrl.origin) {
    throw new GuestHttpError(
      403,
      "origin_mismatch",
      "只允许从当前网站发起模型运行。"
    );
  }
}

function _assertJsonRequest(request: Request): void {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    throw new GuestHttpError(
      415,
      "unsupported_media_type",
      "请求必须使用 JSON 格式。"
    );
  }
}

function _publicQuota(
  quota: GuestQuotaDecision,
  config: GuestCloudConfig
) {
  return {
    model: config.modelId,
    browserDailyLimit: config.browserDailyLimit,
    browserRemaining: quota.browserRemaining,
    ipRemaining: quota.ipRemaining,
    resetsAt: _nextUtcDay().toISOString(),
    byokAvailable: false,
  };
}

function _nextUtcDay(): Date {
  const now = new Date();
  return new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() + 1
    )
  );
}

function _setQuotaHeaders(
  headers: Headers,
  quota: GuestQuotaDecision,
  config: GuestCloudConfig
): void {
  headers.set(
    "X-Guest-Quota-Limit",
    String(config.browserDailyLimit)
  );
  headers.set(
    "X-Guest-Quota-Remaining",
    String(quota.browserRemaining)
  );
}

function _json(body: unknown, init: ResponseInit = {}): Response {
  const headers = _securityHeaders(init.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");
  return new Response(`${JSON.stringify(body)}\n`, { ...init, headers });
}

function _securityHeaders(initial?: HeadersInit): Headers {
  const headers = new Headers(initial);
  headers.set("Cache-Control", "no-store");
  headers.set("Referrer-Policy", "no-referrer");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
  headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()"
  );
  return headers;
}
