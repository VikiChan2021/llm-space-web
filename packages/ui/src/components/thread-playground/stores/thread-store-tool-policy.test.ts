import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import type { AgentEvent, AgentTransport } from "@llm-space/core";

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

describe("host tool execution policy", () => {
  test("runs an allowed tool and continues the ReAct loop", async () => {
    let transportCalls = 0;
    let toolCalls = 0;
    const transport: AgentTransport = async function* () {
      transportCalls += 1;
      if (transportCalls === 1) {
        yield* _toolCallEvents("call-1");
      } else {
        yield* _textEvents("完成");
      }
    };
    const store = _store(transport, {
      canAutoExecuteTool: () => true,
      executeTool: async () => {
        toolCalls += 1;
        return {
          content: [{ type: "text", text: "virtual content" }],
          isError: false,
        };
      },
    });

    await store.getState().run();

    expect(transportCalls).toBe(2);
    expect(toolCalls).toBe(1);
    const messages = store.getState().thread.context?.messages ?? [];
    const toolMessage = messages.find(
      (message) => message.role === "assistant" && message.toolCalls?.length
    );
    expect(
      toolMessage?.role === "assistant"
        ? toolMessage.toolCalls?.[0]?.output?.content[0]?.type === "text"
          ? toolMessage.toolCalls[0].output.content[0].text
          : undefined
        : undefined
    ).toBe("virtual content");
  });

  test("pauses automatic execution when the host requires review", async () => {
    let transportCalls = 0;
    let toolCalls = 0;
    const transport: AgentTransport = async function* () {
      transportCalls += 1;
      yield* _toolCallEvents("call-review");
    };
    const store = _store(transport, {
      canAutoExecuteTool: () => false,
      executeTool: async () => {
        toolCalls += 1;
        return {
          content: [{ type: "text", text: "should not run" }],
          isError: false,
        };
      },
    });

    await store.getState().run();

    expect(transportCalls).toBe(1);
    expect(toolCalls).toBe(0);
  });

  test("caps a guest ReAct run at the host model-turn limit", async () => {
    let transportCalls = 0;
    let toolCalls = 0;
    const transport: AgentTransport = async function* () {
      transportCalls += 1;
      yield* _toolCallEvents(`call-${transportCalls}`);
    };
    const store = _store(transport, {
      canAutoExecuteTool: () => true,
      maxAutoToolTurns: 2,
      maxAutoToolCalls: 8,
      executeTool: async () => {
        toolCalls += 1;
        return { content: [{ type: "text", text: "ok" }], isError: false };
      },
    });

    await store.getState().run();

    expect(transportCalls).toBe(2);
    expect(toolCalls).toBe(2);
  });
});

function _store(
  transport: AgentTransport,
  options: {
    canAutoExecuteTool: () => boolean;
    executeTool: () => Promise<{
      content: { type: "text"; text: string }[];
      isError: boolean;
    }>;
    maxAutoToolTurns?: number;
    maxAutoToolCalls?: number;
  }
) {
  return createThreadStore(
    {
      context: {
        tools: [
          {
            type: "builtin",
            name: "read",
            description: "Read a virtual file.",
            parameters: {
              type: "object",
              required: ["path"],
              properties: { path: { type: "string" } },
            },
          },
        ],
        messages: [
          {
            id: "user-1",
            role: "user",
            content: [{ type: "text", text: "读取文件" }],
          },
        ],
      },
    },
    {
      transport,
      resolveModel: () => ({ provider: "test", id: "test" }),
      getReactLoop: () => true,
      executeTool: options.executeTool,
      canAutoExecuteTool: options.canAutoExecuteTool,
      maxAutoToolTurns: options.maxAutoToolTurns,
      maxAutoToolCalls: options.maxAutoToolCalls,
    }
  );
}

function _event(value: unknown): AgentEvent {
  return value as AgentEvent;
}

function _toolCallEvents(id: string): AgentEvent[] {
  return [
    _event({
      type: "message_start",
      message: { role: "assistant" },
    }),
    _event({
      type: "message_update",
      assistantMessageEvent: {
        type: "toolcall_start",
        contentIndex: 0,
        partial: {
          role: "assistant",
          content: [
            {
              type: "toolCall",
              id,
              name: "read",
              arguments: {},
            },
          ],
        },
      },
    }),
    _event({
      type: "message_update",
      assistantMessageEvent: {
        type: "toolcall_delta",
        contentIndex: 0,
        delta: '{"path":"README.md"}',
      },
    }),
    _event({
      type: "message_update",
      assistantMessageEvent: {
        type: "toolcall_end",
        contentIndex: 0,
        toolCall: {
          type: "toolCall",
          id,
          name: "read",
          arguments: { path: "README.md" },
        },
      },
    }),
    _event({
      type: "message_end",
      message: { role: "assistant" },
    }),
  ];
}

function _textEvents(text: string): AgentEvent[] {
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
    _event({
      type: "message_end",
      message: { role: "assistant" },
    }),
  ];
}
