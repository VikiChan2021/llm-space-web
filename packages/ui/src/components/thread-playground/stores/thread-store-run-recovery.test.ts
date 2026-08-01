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
  globalThis.requestAnimationFrame = (callback) =>
    setTimeout(() => callback(performance.now()), 0);
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
    expect(getMessageText(state.thread.context?.messages?.at(-1))).toBe(
      "部分回答"
    );
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
    expect(getMessageText(state.thread.context?.messages?.at(-1))).toBe(
      "完整回答"
    );
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
        signal.addEventListener("abort", () => resolve(), { once: true });
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
    expect(getMessageText(state.thread.context?.messages?.at(-1))).toBe(
      "停止前内容"
    );
    expect(state.runHistory).toHaveLength(0);
  });

  test("图片 Thread 在调用文本模型前给出切换提示", async () => {
    let transportCalled = false;
    const transport: AgentTransport = async function* () {
      await Promise.resolve();
      transportCalled = true;
      yield* _completedEvents("不应执行");
    };
    const store = createThreadStore(
      {
        context: {
          messages: [
            {
              id: "user-image",
              role: "user",
              content: [
                { type: "image_data", mimeType: "image/png", data: "aA==" },
                { type: "text", text: "请描述图片" },
              ],
            },
          ],
        },
      },
      {
        transport,
        resolveModel: () => ({ provider: "test", id: "text-only" }),
        supportsImageInput: () => false,
        captureRunResults: true,
      }
    );

    await store.getState().run();

    expect(transportCalled).toBe(false);
    const result = store.getState().lastRunResult;
    expect(result?.outcome).toBe("failed");
    expect(
      result?.outcome === "failed" && result.error instanceof Error
        ? result.error.message
        : ""
    ).toContain("当前模型不支持图片输入");
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
