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
  maxRequestBytes: 10 * 1024 * 1024,
  maxTextCharacters: 12_000,
  maxImages: 5,
  maxImageBytes: 4 * 1024 * 1024,
  maxTotalImageBytes: 6 * 1024 * 1024,
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
    expect(body.match(/"input":\["text","image"\]/g)).toHaveLength(1);
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
    const handler = createGuestFetchHandler({
      config: CONFIG,
      quotaStore,
      execute,
      now: () => new Date("2026-07-29T12:00:00.000Z"),
    });

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

  test("只允许 GLM-4.6V 执行有界图片请求", async () => {
    let receivedContent: unknown = null;
    const execute: GuestModelExecutor = async function* (request) {
      await Promise.resolve();
      receivedContent = request.context.messages[0]?.content;
      yield { type: "agent_start" };
    };
    const quotaStore = new GuestQuotaStore(":memory:", CONFIG.hmacSecret);
    const handler = createGuestFetchHandler({ config: CONFIG, quotaStore, execute });
    const image = {
      type: "image",
      mimeType: "image/png",
      data: Buffer.from("small-image").toString("base64"),
    };

    const unsupported = await handler(
      _multimodalRunRequest(GUEST_ID, "glm-4.5-air", image)
    );
    expect(unsupported.status).toBe(400);
    expect(await unsupported.text()).toContain(
      '"code":"guest_model_input_unsupported"'
    );
    expect(receivedContent).toBeNull();

    const accepted = await handler(
      _multimodalRunRequest(GUEST_ID, "glm-4.6v", image)
    );
    await accepted.text();
    expect(accepted.status).toBe(200);
    expect(receivedContent).toEqual([
      image,
      { type: "text", text: "请描述图片" },
    ]);
    quotaStore.close();
  });

  test("在调用模型前拒绝无效类型、Base64 和超限图片", async () => {
    let executed = false;
    const execute: GuestModelExecutor = async function* () {
      await Promise.resolve();
      executed = true;
      yield { type: "agent_start" };
    };
    const quotaStore = new GuestQuotaStore(":memory:", CONFIG.hmacSecret);
    const handler = createGuestFetchHandler({
      config: { ...CONFIG, maxImageBytes: 4, maxTotalImageBytes: 8 },
      quotaStore,
      execute,
    });

    const unsupportedType = await handler(
      _multimodalRunRequest(GUEST_ID, "glm-4.6v", {
        type: "image",
        mimeType: "image/gif",
        data: "aGVsbG8=",
      })
    );
    expect(unsupportedType.status).toBe(415);
    expect(await unsupportedType.text()).toContain('"code":"unsupported_image"');

    const invalidBase64 = await handler(
      _multimodalRunRequest(GUEST_ID, "glm-4.6v", {
        type: "image",
        mimeType: "image/png",
        data: "not-base64!",
      })
    );
    expect(invalidBase64.status).toBe(400);
    expect(await invalidBase64.text()).toContain('"code":"invalid_image"');

    const tooLarge = await handler(
      _multimodalRunRequest(GUEST_ID, "glm-4.6v", {
        type: "image",
        mimeType: "image/png",
        data: Buffer.from("12345").toString("base64"),
      })
    );
    expect(tooLarge.status).toBe(413);
    expect(await tooLarge.text()).toContain('"code":"image_size_limit"');
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

  test("streams registered coach explanations without consuming model quota", async () => {
    let executed = false;
    const execute: GuestModelExecutor = async function* () {
      executed = true;
      yield { type: "agent_end", messages: [] };
    };
    const quotaStore = new GuestQuotaStore(":memory:", CONFIG.hmacSecret);
    const handler = createGuestFetchHandler({
      config: CONFIG,
      quotaStore,
      execute,
      now: () => new Date("2026-07-29T12:00:00.000Z"),
    });

    const response = await handler(_coachRequest("解释 Models"));
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(body).toContain('"type":"RUN_STARTED"');
    expect(body).toContain('"toolCallName":"highlight_element"');
    expect(body).toContain('\\"elementId\\":\\"models\\"');
    expect(body).toContain('"type":"RUN_FINISHED"');
    expect(executed).toBe(false);
    expect(
      quotaStore.read(
        GUEST_ID,
        "1.2.3.4",
        new Date("2026-07-29T12:00:00.000Z"),
        CONFIG.browserDailyLimit,
        CONFIG.ipDailyLimit
      ).browserRemaining
    ).toBe(CONFIG.browserDailyLimit);
    quotaStore.close();
  });

  test("pauses coach Run actions and emits the command only after approval", async () => {
    const quotaStore = new GuestQuotaStore(":memory:", CONFIG.hmacSecret);
    const handler = createGuestFetchHandler({
      config: CONFIG,
      quotaStore,
      execute: _completedExecutor,
    });

    const interrupted = await handler(_coachRequest("运行当前 Thread", "run-1"));
    const interruptedBody = await interrupted.text();
    expect(interruptedBody).toContain('"type":"interrupt"');
    expect(interruptedBody).toContain('"action":"request_run"');
    expect(interruptedBody).not.toContain('"toolCallName":"request_run"');

    const resumed = await handler(
      _coachRequest("运行当前 Thread", "run-2", [
        {
          interruptId: "run-current-thread:run-1",
          status: "resolved",
          payload: { approved: true },
        },
      ])
    );
    const resumedBody = await resumed.text();
    expect(resumedBody).toContain('"toolCallName":"request_run"');

    const rerunInterrupted = await handler(
      _coachRequest("从第一条用户消息运行当前 Thread", "run-3")
    );
    expect(await rerunInterrupted.text()).toContain(
      '"action":"request_run"'
    );
    expect(resumedBody).toContain('"outcome":{"type":"success"}');
    quotaStore.close();
  });

  test("keeps conceptual run questions in the explanatory model path", async () => {
    let executed = false;
    const execute: GuestModelExecutor = async function* () {
      executed = true;
      yield { type: "agent_end", messages: [] };
    };
    const quotaStore = new GuestQuotaStore(":memory:", CONFIG.hmacSecret);
    const handler = createGuestFetchHandler({
      config: CONFIG,
      quotaStore,
      execute,
    });

    const response = await handler(_coachRequest("Agent 的运行机制是什么？"));
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).not.toContain('"type":"interrupt"');
    expect(executed).toBe(true);
    quotaStore.close();
  });

  test("accepts the AG-UI assistant tool-call message on a follow-up", async () => {
    const quotaStore = new GuestQuotaStore(":memory:", CONFIG.hmacSecret);
    const handler = createGuestFetchHandler({
      config: CONFIG,
      quotaStore,
      execute: _completedExecutor,
    });
    const request = _coachRequest("打开 Variables");
    const payload = (await request.json()) as Record<string, unknown>;
    payload.messages = [
      { id: "user-1", role: "user", content: "解释 Models" },
      {
        id: "assistant-tool-1",
        role: "assistant",
        toolCalls: [
          {
            id: "call-1",
            type: "function",
            function: {
              name: "highlight_element",
              arguments: '{"elementId":"models"}',
            },
          },
        ],
      },
      { id: "user-2", role: "user", content: "打开 Variables" },
    ];
    const response = await handler(
      new Request(request.url, {
        method: request.method,
        headers: request.headers,
        body: JSON.stringify(payload),
      })
    );
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain('"toolCallName":"open_variables"');
    quotaStore.close();
  });

  test("uses the existing model executor for open coach questions", async () => {
    let systemPrompt = "";
    const execute: GuestModelExecutor = async function* (request) {
      systemPrompt = request.context.systemPrompt ?? "";
      yield {
        type: "message_end",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "先观察 Trace，再修改一个变量。" }],
          api: "openai-completions",
          provider: "bigmodel",
          model: "glm-4.5-air",
          usage: {
            input: 1,
            output: 1,
            cacheRead: 0,
            cacheWrite: 0,
            totalTokens: 2,
            cost: {
              input: 0,
              output: 0,
              cacheRead: 0,
              cacheWrite: 0,
              total: 0,
            },
          },
          stopReason: "stop",
          timestamp: Date.now(),
        },
      };
      yield { type: "agent_end", messages: [] };
    };
    const quotaStore = new GuestQuotaStore(":memory:", CONFIG.hmacSecret);
    const handler = createGuestFetchHandler({ config: CONFIG, quotaStore, execute });

    const response = await handler(_coachRequest("怎样调试一个 Agent？"));
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("X-Guest-Quota-Remaining")).toBe(
      String(CONFIG.browserDailyLimit - 1)
    );
    expect(body).toContain('"type":"TEXT_MESSAGE_CONTENT"');
    expect(body).toContain("先观察 Trace，再修改一个变量。");
    expect(systemPrompt).toContain("页面动作只由前端白名单注册表执行");
    expect(systemPrompt).not.toContain("rawPrompt");
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

function _coachRequest(
  message: string,
  runId = "coach-run",
  resume?: Record<string, unknown>[]
): Request {
  return new Request("http://internal/api/guest/coach", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: CONFIG.publicUrl.origin,
      Cookie: `llm_space_guest=${GUEST_ID}`,
      "X-Real-IP": "1.2.3.4",
    },
    body: JSON.stringify({
      threadId: "coach-thread",
      runId,
      state: {},
      messages: [{ id: `message:${runId}`, role: "user", content: message }],
      tools: [],
      context: [
        {
          description: "llm-space guest workbench context",
          value: JSON.stringify({
            page: "guest-workbench",
            activeThreadTitle: "查询天气",
            starterId: "weather",
            running: false,
            selectedModel: "glm-4.5-air",
            toolCount: 3,
            messageCount: 1,
            rawPrompt: "must not leave the browser",
          }),
        },
      ],
      forwardedProps: {},
      ...(resume ? { resume } : {}),
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

function _multimodalRunRequest(
  guestId: string,
  modelId: string,
  image: Record<string, unknown>
): Request {
  return new Request("http://internal/api/guest/runs", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: CONFIG.publicUrl.origin,
      Cookie: `llm_space_guest=${guestId}`,
      "X-Real-IP": "1.2.3.4",
    },
    body: JSON.stringify({
      model: { provider: "bigmodel", id: modelId },
      context: {
        systemPrompt: "",
        tools: [],
        messages: [
          {
            role: "user",
            content: [image, { type: "text", text: "请描述图片" }],
            timestamp: Date.now(),
          },
        ],
      },
    }),
  });
}
