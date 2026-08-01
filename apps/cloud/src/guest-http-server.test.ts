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
  modelId: "glm-4.5-air",
  quotaDatabasePath: ":memory:",
  hmacSecret: "h".repeat(32),
  browserDailyLimit: 2,
  ipDailyLimit: 3,
  maxConcurrentPerGuest: 1,
  maxRequestBytes: 128 * 1024,
  maxTextCharacters: 12_000,
  maxOutputTokens: 2048,
  remoteMcpEnabled: false,
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
      model: "glm-4.5-air",
      browserDailyLimit: 2,
      browserRemaining: 2,
      byokAvailable: false,
    });
    expect(JSON.stringify(body)).not.toContain(CONFIG.apiKey);
    quotaStore.close();
  });

  test("returns the server model catalog without exposing credentials", async () => {
    const quotaStore = new GuestQuotaStore(":memory:", CONFIG.hmacSecret);
    const handler = createGuestFetchHandler({
      config: CONFIG,
      quotaStore,
      execute: _completedExecutor,
    });

    const response = await handler(
      new Request("http://internal/api/guest/models")
    );
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain('"id":"glm-4.5-air"');
    expect(body).toContain('"id":"glm-4.7"');
    expect(body).toContain('"id":"glm-4.6v"');
    expect(body).not.toContain('"id":"glm-4.7-flash"');
    expect(body.match(/"api":"openai-completions"/g)).toHaveLength(3);
    expect(body).not.toContain(CONFIG.apiKey);
    quotaStore.close();
  });

  test("executes an allowed selected model and rejects forged ids before quota", async () => {
    let selectedModel = "";
    const execute: GuestModelExecutor = async function* (request) {
      await Promise.resolve();
      selectedModel = request.model.id;
      yield { type: "agent_start" };
    };
    const quotaStore = new GuestQuotaStore(":memory:", CONFIG.hmacSecret);
    const handler = createGuestFetchHandler({ config: CONFIG, quotaStore, execute });

    const accepted = await handler(
      _runRequest(GUEST_ID, CONFIG.publicUrl.origin, "hello", [], "glm-4.6v")
    );
    await accepted.text();
    expect(accepted.status).toBe(200);
    expect(selectedModel).toBe("glm-4.6v");

    const rejected = await handler(
      _runRequest(GUEST_ID, CONFIG.publicUrl.origin, "hello", [], "forged-model")
    );
    expect(rejected.status).toBe(400);
    expect(await rejected.text()).toContain('"code":"guest_model_unavailable"');

    const quota = await handler(
      new Request("http://internal/api/guest/quota", {
        headers: {
          Cookie: `llm_space_guest=${GUEST_ID}`,
          "X-Real-IP": "1.2.3.4",
        },
      })
    );
    expect(await quota.json()).toMatchObject({ browserRemaining: 1 });
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

  test("accepts bounded tools and rejects malformed or oversized requests", async () => {
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

    const acceptedTool = await handler(
      _runRequest(GUEST_ID, CONFIG.publicUrl.origin, "hello", [
        {
          name: "lookup_order",
          description: "Look up one order.",
          parameters: {
            type: "object",
            required: ["id"],
            properties: { id: { type: "string" } },
          },
        },
      ])
    );
    await acceptedTool.text();
    expect(acceptedTool.status).toBe(200);
    expect(executed).toBe(true);

    executed = false;
    const rejectedTool = await handler(
      _runRequest(GUEST_ID, CONFIG.publicUrl.origin, "hello", [
        {
          name: "../unsafe",
          description: "must not reach the model",
          parameters: {},
        },
      ])
    );
    expect(rejectedTool.status).toBe(400);
    expect(executed).toBe(false);
    quotaStore.close();
  });

  test("runs the same-origin demo MCP through the bounded guest tool API", async () => {
    const quotaStore = new GuestQuotaStore(":memory:", CONFIG.hmacSecret);
    const handler = createGuestFetchHandler({
      config: CONFIG,
      quotaStore,
      execute: _completedExecutor,
      now: () => new Date("2026-07-29T12:00:00.000Z"),
    });

    const listed = await handler(
      _toolRequest("/api/guest/mcp/tools", {
        serverId: "guest-demo-mcp",
      })
    );
    const listedBody = await listed.text();
    expect(listed.status).toBe(200);
    expect(listedBody).toContain('"name":"calculator"');
    expect(listedBody).toContain('"name":"current_time"');

    const called = await handler(
      _toolRequest("/api/guest/mcp/call", {
        serverId: "guest-demo-mcp",
        toolName: "calculator",
        arguments: { a: 7, operator: "*", b: 6 },
      })
    );
    const calledBody = await called.text();
    expect(called.status).toBe(200);
    expect(calledBody).toContain('\\"result\\":42');
    expect(calledBody).not.toContain(CONFIG.apiKey);
    quotaStore.close();
  });

  test("keeps public remote MCP closed until network egress isolation is enabled", async () => {
    const quotaStore = new GuestQuotaStore(":memory:", CONFIG.hmacSecret);
    const handler = createGuestFetchHandler({
      config: CONFIG,
      quotaStore,
      execute: _completedExecutor,
    });

    const response = await handler(
      _toolRequest("/api/guest/mcp/tools", {
        serverId: "public-docs",
        url: "https://example.com/mcp",
      })
    );
    const body = await response.text();

    expect(response.status).toBe(403);
    expect(body).toContain('"code":"remote_mcp_disabled"');
    quotaStore.close();
  });

  test("accepts a tool-result continuation as the final wire message", async () => {
    let executed = false;
    const execute: GuestModelExecutor = async function* () {
      await Promise.resolve();
      executed = true;
      yield { type: "agent_start" };
      yield { type: "agent_end", messages: [] };
    };
    const quotaStore = new GuestQuotaStore(":memory:", CONFIG.hmacSecret);
    const handler = createGuestFetchHandler({
      config: CONFIG,
      quotaStore,
      execute,
    });
    const response = await handler(
      new Request("http://internal/api/guest/runs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: CONFIG.publicUrl.origin,
          Cookie: `llm_space_guest=${GUEST_ID}`,
          "X-Real-IP": "1.2.3.4",
        },
        body: JSON.stringify({
          model: { provider: "bigmodel", id: "glm-4.5-air" },
          context: {
            systemPrompt: "",
            tools: [
              {
                name: "calculator",
                description: "Calculate.",
                parameters: { type: "object" },
              },
            ],
            messages: [
              {
                role: "user",
                content: [{ type: "text", text: "2+2?" }],
                timestamp: Date.now(),
              },
              {
                role: "assistant",
                content: [
                  {
                    type: "toolCall",
                    id: "call-1",
                    name: "calculator",
                    arguments: { a: 2, operator: "+", b: 2 },
                  },
                ],
                timestamp: Date.now(),
              },
              {
                role: "toolResult",
                toolCallId: "call-1",
                toolName: "calculator",
                content: [{ type: "text", text: "4" }],
                isError: false,
                timestamp: Date.now(),
              },
            ],
          },
        }),
      })
    );
    await response.text();
    expect(response.status).toBe(200);
    expect(executed).toBe(true);
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

  test("redacts provider failures encoded as normal agent events", async () => {
    const execute: GuestModelExecutor = async function* () {
      await Promise.resolve();
      yield { type: "agent_start" };
      yield {
        type: "message_start",
        message: {
          role: "assistant",
          content: [],
          api: "openai-completions",
          provider: "bigmodel",
          model: "glm-4.7",
          usage: {
            input: 0,
            output: 0,
            cacheRead: 0,
            cacheWrite: 0,
            totalTokens: 0,
            cost: {
              input: 0,
              output: 0,
              cacheRead: 0,
              cacheWrite: 0,
              total: 0,
            },
          },
          stopReason: "error",
          timestamp: Date.now(),
          errorMessage: `upstream leaked ${CONFIG.apiKey}`,
        },
      };
      yield { type: "agent_end", messages: [] };
    };
    const quotaStore = new GuestQuotaStore(":memory:", CONFIG.hmacSecret);
    const handler = createGuestFetchHandler({
      config: CONFIG,
      quotaStore,
      execute,
    });

    const response = await handler(
      _runRequest(GUEST_ID, CONFIG.publicUrl.origin, "hello", [], "glm-4.7")
    );
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain('"type":"guest_run_error"');
    expect(body).toContain('"code":"model_service_unavailable"');
    expect(body).toContain("请在 Models 中切换其他智谱模型");
    expect(body).toContain("data: [DONE]");
    expect(body).not.toContain("upstream leaked");
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
  tools: unknown[] = [],
  modelId = "glm-4.5-air"
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
      model: { provider: "bigmodel", id: modelId },
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

function _toolRequest(
  path: string,
  body: Record<string, unknown>
): Request {
  return new Request(`http://internal${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: CONFIG.publicUrl.origin,
      Cookie: `llm_space_guest=${GUEST_ID}`,
      "X-Real-IP": "1.2.3.4",
    },
    body: JSON.stringify(body),
  });
}
