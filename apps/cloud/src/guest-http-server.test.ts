import { describe, expect, test } from "bun:test";

import type { AgentEvent } from "@earendil-works/pi-agent-core";

import type { GuestCloudConfig } from "./guest-config";
import {
  createGuestFetchHandler,
  type GuestModelExecutor,
} from "./guest-http-server";
import { GuestQuotaStore } from "./guest-quota";

const CONFIG: GuestCloudConfig = {
  host: "127.0.0.1",
  port: 8791,
  publicUrl: new URL("http://127.0.0.1:5175/llm-space-web/"),
  apiKey: "never-return-this-key",
  modelId: "glm-4.7-flash",
  quotaDatabasePath: ":memory:",
  hmacSecret: "h".repeat(32),
  browserDailyLimit: 2,
  ipDailyLimit: 3,
  maxConcurrentPerGuest: 1,
  maxRequestBytes: 128 * 1024,
  maxTextCharacters: 12_000,
  maxOutputTokens: 2048,
  trustProxy: true,
  secureCookies: false,
};
const GUEST_ID = "g".repeat(43);

describe("guest HTTP API", () => {
  test("issues an opaque cookie and returns quota metadata", async () => {
    const quotaStore = new GuestQuotaStore(":memory:", CONFIG.hmacSecret);
    const handler = createGuestFetchHandler({
      config: CONFIG,
      quotaStore,
      execute: _completedExecutor,
      now: () => new Date("2026-07-29T12:00:00.000Z"),
    });

    const response = await handler(
      new Request("http://internal/api/guest/quota")
    );
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain(
      "llm_space_guest="
    );
    expect(body).toMatchObject({
      model: "glm-4.7-flash",
      browserDailyLimit: 2,
      browserRemaining: 2,
      byokAvailable: false,
    });
    expect(JSON.stringify(body)).not.toContain(CONFIG.apiKey);
    quotaStore.close();
  });

  test("streams shared agent events and decrements quota", async () => {
    const quotaStore = new GuestQuotaStore(":memory:", CONFIG.hmacSecret);
    const handler = createGuestFetchHandler({
      config: CONFIG,
      quotaStore,
      execute: _completedExecutor,
      now: () => new Date("2026-07-29T12:00:00.000Z"),
    });
    const request = _runRequest(GUEST_ID);

    const response = await handler(request);
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain(
      "text/event-stream"
    );
    expect(response.headers.get("x-guest-quota-remaining")).toBe("1");
    expect(response.headers.get("x-request-id")).toMatch(/^[a-f0-9]{24}$/);
    expect(text).toContain("data: [START]");
    expect(text).toContain('"type":"agent_start"');
    expect(text).toContain("data: [DONE]");
    expect(text).not.toContain(CONFIG.apiKey);
    quotaStore.close();
  });

  test("blocks wrong-origin and over-quota requests with redacted errors", async () => {
    const quotaStore = new GuestQuotaStore(":memory:", CONFIG.hmacSecret);
    const handler = createGuestFetchHandler({
      config: { ...CONFIG, browserDailyLimit: 1 },
      quotaStore,
      execute: _completedExecutor,
      now: () => new Date("2026-07-29T12:00:00.000Z"),
    });

    const wrongOrigin = await handler(
      _runRequest(GUEST_ID, "https://evil.example")
    );
    expect(wrongOrigin.status).toBe(403);

    const accepted = await handler(_runRequest(GUEST_ID));
    await accepted.text();
    const exhausted = await handler(_runRequest(GUEST_ID));
    const body = await exhausted.text();
    expect(exhausted.status).toBe(429);
    expect(body).toContain("BYOK");
    expect(body).toContain('"code":"guest_daily_limit"');
    expect(body).toContain('"requestId":"');
    expect(exhausted.headers.get("x-request-id")).toMatch(/^[a-f0-9]{24}$/);
    expect(body).not.toContain(CONFIG.apiKey);
    quotaStore.close();
  });

  test("rejects non-text and oversized conversations before execution", async () => {
    let executed = false;
    const execute: GuestModelExecutor = async function* () {
      await Promise.resolve();
      executed = true;
      yield { type: "agent_start" };
    };
    const quotaStore = new GuestQuotaStore(":memory:", CONFIG.hmacSecret);
    const handler = createGuestFetchHandler({
      config: { ...CONFIG, maxTextCharacters: 8 },
      quotaStore,
      execute,
    });
    const oversized = await handler(
      _runRequest(GUEST_ID, CONFIG.publicUrl.origin, "123456789")
    );

    expect(oversized.status).toBe(413);
    expect(executed).toBe(false);

    const rejectedTool = await handler(
      _runRequest(GUEST_ID, CONFIG.publicUrl.origin, "hello", [
        {
          type: "function",
          name: "unsafe_tool",
          description: "must not reach the model",
          parameters: {},
        },
      ])
    );
    expect(rejectedTool.status).toBe(400);
    expect(executed).toBe(false);
    quotaStore.close();
  });

  test("sends a redacted structured SSE error after streaming has started", async () => {
    const execute: GuestModelExecutor = async function* () {
      await Promise.resolve();
      yield { type: "agent_start" };
      throw new Error(`upstream leaked ${CONFIG.apiKey}`);
    };
    const quotaStore = new GuestQuotaStore(":memory:", CONFIG.hmacSecret);
    const handler = createGuestFetchHandler({
      config: CONFIG,
      quotaStore,
      execute,
    });

    const response = await handler(_runRequest(GUEST_ID));
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain('"type":"guest_run_error"');
    expect(body).toContain('"code":"model_service_unavailable"');
    expect(body).toContain('"requestId":"');
    expect(body).toContain("data: [DONE]");
    expect(body).not.toContain(CONFIG.apiKey);
    quotaStore.close();
  });
});

async function* _completedExecutor(): AsyncIterable<AgentEvent> {
  await Promise.resolve();
  yield { type: "agent_start" };
  yield { type: "agent_end", messages: [] };
}

function _runRequest(
  guestId: string,
  origin = CONFIG.publicUrl.origin,
  message = "hello",
  tools: unknown[] = []
): Request {
  return new Request("http://internal/api/guest/runs", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: origin,
      Cookie: `llm_space_guest=${guestId}`,
      "X-Real-IP": "1.2.3.4",
    },
    body: JSON.stringify({
      model: { provider: "bigmodel", id: "glm-4.7-flash" },
      context: {
        systemPrompt: "",
        tools,
        messages: [
          {
            role: "user",
            content: [{ type: "text", text: message }],
            timestamp: Date.now(),
          },
        ],
      },
    }),
  });
}
