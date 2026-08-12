import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import {
  getMessageText,
  type AgentEvent,
  type AgentTransport,
} from "@llm-space/core";

import { createThreadStore } from "./thread-store";

const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
const originalCancelAnimationFrame = globalThis.cancelAnimationFrame;

beforeAll(() => {
  globalThis.requestAnimationFrame = ((callback: FrameRequestCallback) =>
    setTimeout(() => callback(performance.now()), 0)) as never;
  globalThis.cancelAnimationFrame = (handle) => clearTimeout(handle);
});

afterAll(() => {
  globalThis.requestAnimationFrame = originalRequestAnimationFrame;
  globalThis.cancelAnimationFrame = originalCancelAnimationFrame;
});

describe("Thread Run 错误恢复", () => {
  test("失败时保留部分输出且不写入成功 Run 历史", async () => {
    const transport: AgentTransport = async function* () {
      yield* _partialEvents("部分回答");
      throw new Error("temporary failure");
    };
    const store = _store(transport);

    await store.getState().run();

    const state = store.getState();
    expect(state.lastRunResult).toMatchObject({
      outcome: "failed",
      partialOutput: true,
      retryFromMessageId: "user-1",
    });
    expect(state.runHistory).toHaveLength(0);
    const lastMessage = state.thread.context?.messages?.at(-1);
    if (!lastMessage) throw new Error("Expected a final message");
    expect(getMessageText(lastMessage)).toBe("部分回答");
  });

  test("从原始用户消息重新运行并替换不完整输出", async () => {
    let attempt = 0;
    const transport: AgentTransport = async function* () {
      attempt += 1;
      if (attempt === 1) {
        yield* _partialEvents("不完整");
        throw new Error("temporary failure");
      }
      yield* _completedEvents("完整回答");
    };
    const store = _store(transport);

    await store.getState().run();
    const retryFromMessageId =
      store.getState().lastRunResult?.retryFromMessageId;
    await store.getState().run(retryFromMessageId);

    const state = store.getState();
    expect(state.lastRunResult).toBeNull();
    expect(state.runHistory).toHaveLength(1);
    expect(state.thread.context?.messages).toHaveLength(2);
    const lastMessage = state.thread.context?.messages?.at(-1);
    if (!lastMessage) throw new Error("Expected a final message");
    expect(getMessageText(lastMessage)).toBe("完整回答");
  });

  test("主动停止与失败分开记录并保留部分输出", async () => {
    let markStreamingStarted: (() => void) | undefined;
    const streamingStarted = new Promise<void>((resolve) => {
      markStreamingStarted = resolve;
    });
    const transport: AgentTransport = async function* (_request, { signal }) {
      yield* _partialEvents("停止前内容");
      markStreamingStarted?.();
      await new Promise<void>((resolve) => {
        signal?.addEventListener("abort", () => resolve(), { once: true });
      });
      throw new DOMException("Aborted", "AbortError");
    };
    const store = _store(transport);

    const running = store.getState().run();
    await streamingStarted;
    store.getState().abort();
    await running;

    const state = store.getState();
    expect(state.lastRunResult).toMatchObject({
      outcome: "aborted",
      partialOutput: true,
      retryFromMessageId: "user-1",
    });
    const lastMessage = state.thread.context?.messages?.at(-1);
    if (!lastMessage) throw new Error("Expected a final message");
    expect(getMessageText(lastMessage)).toBe("停止前内容");
    expect(state.runHistory).toHaveLength(0);
  });

  test("图片历史不会阻断文本模型的后续纯文本消息", async () => {
    let transportCalled = false;
    let sentRequest = "";
    const transport: AgentTransport = async function* (request) {
      await Promise.resolve();
      transportCalled = true;
      sentRequest = JSON.stringify(request);
      yield* _completedEvents("可以继续交流");
    };
    const store = createThreadStore(
      {
        context: {
          messages: [
            {
              id: "user-image",
              role: "user",
              content: [
                { type: "image", mimeType: "image/png", data: "aA==" },
                { type: "text", text: "请描述图片" },
              ],
            },
            {
              id: "assistant-image",
              role: "assistant",
              content: [{ type: "text", text: "图片回答" }],
            },
            {
              id: "user-text",
              role: "user",
              content: [{ type: "text", text: "你是谁？" }],
            },
          ],
        },
      },
      {
        transport,
        resolveModel: () => ({ provider: "test", id: "text-only" }),
        captureRunResults: true,
      }
    );

    await store.getState().run();

    expect(transportCalled).toBe(true);
    expect(sentRequest).not.toContain("image_data");
    expect(sentRequest).toContain("\"type\":\"image\"");
    expect(sentRequest).toContain("你是谁？");
    expect(store.getState().lastRunResult).toBeNull();
    expect(store.getState().thread.context?.messages?.[0]?.content[0]?.type).toBe(
      "image"
    );
  });
});

function _store(transport: AgentTransport) {
  return createThreadStore(
    {
      context: {
        messages: [
          {
            id: "user-1",
            role: "user",
            content: [{ type: "text", text: "请回答" }],
          },
        ],
      },
    },
    {
      transport,
      resolveModel: () => ({ provider: "test", id: "test" }),
      captureRunResults: true,
    }
  );
}

function _event(value: unknown): AgentEvent {
  return value as AgentEvent;
}

function _partialEvents(text: string): AgentEvent[] {
  return [
    _event({
      type: "message_start",
      message: { role: "assistant" },
    }),
    _event({
      type: "message_update",
      assistantMessageEvent: { type: "text_start", contentIndex: 0 },
    }),
    _event({
      type: "message_update",
      assistantMessageEvent: {
        type: "text_delta",
        contentIndex: 0,
        delta: text,
      },
    }),
  ];
}

function _completedEvents(text: string): AgentEvent[] {
  return [
    ..._partialEvents(text),
    _event({
      type: "message_end",
      message: { role: "assistant" },
    }),
  ];
}
