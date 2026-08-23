import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import type { AgentEvent, AgentTransport, Thread } from "@llm-space/core";
import { createEvaluationExperiment } from "@llm-space/core/thread";

import { runGuestEvaluationItem } from "./guest-evaluation-runner";

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

describe("guest evaluation runner", () => {
  test("runs an isolated case and records deterministic checks", async () => {
    const experiment = _experiment();
    experiment.cases[0].expectations = {
      requiredText: "评测通过",
      forbiddenText: "失败",
    };
    const result = await runGuestEvaluationItem({
      experiment,
      evaluationCase: experiment.cases[0],
      variantId: "candidate",
      transport: async function* () {
        yield* _textEvents("评测通过");
      },
      runtimeId: "test-evaluation",
      now: _clock(),
      createId: _ids(),
    });

    expect(result.status).toBe("completed");
    expect(result.modelTurns).toBe(1);
    expect(result.checks.map((check) => check.passed)).toEqual([true, true]);
    expect(result.run?.thread.context?.messages?.at(-1)?.role).toBe("assistant");
  });

  test("marks a manual tool as needs_review without executing it", async () => {
    const experiment = _experiment(true);
    const transport: AgentTransport = async function* () {
      yield* _toolCallEvents("call-write");
    };
    const result = await runGuestEvaluationItem({
      experiment,
      evaluationCase: experiment.cases[0],
      variantId: "baseline",
      transport,
      runtimeId: "test-evaluation-review",
      now: _clock(),
      createId: _ids(),
    });

    expect(result.status).toBe("needs_review");
    expect(result.errorCategory).toBe("tool_review");
    expect(result.toolNames).toEqual(["write"]);
  });
});

function _experiment(includeWriteTool = false) {
  const thread: Thread = {
    title: "Runner test",
    model: { provider: "bigmodel", id: "glm-4-flash-250414" },
    context: {
      messages: [
        {
          id: "user-1",
          role: "user",
          content: [{ type: "text", text: "原始输入" }],
        },
      ],
      tools: includeWriteTool
        ? [
            {
              type: "builtin",
              name: "write",
              description: "Write a virtual file.",
              parameters: {
                type: "object",
                required: ["path", "content"],
                properties: {
                  path: { type: "string" },
                  content: { type: "string" },
                },
              },
            },
          ]
        : [],
    },
  };
  const experiment = createEvaluationExperiment({
    thread,
    model: thread.model!,
    now: 1,
    createId: _ids(),
  });
  experiment.cases[0].input = "新的评测输入";
  return experiment;
}

function _event(value: unknown): AgentEvent {
  return value as AgentEvent;
}

function _textEvents(text: string): AgentEvent[] {
  return [
    _event({ type: "message_start", message: { role: "assistant" } }),
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
    _event({ type: "message_end", message: { role: "assistant" } }),
  ];
}

function _toolCallEvents(id: string): AgentEvent[] {
  return [
    _event({ type: "message_start", message: { role: "assistant" } }),
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
              name: "write",
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
        delta: '{"path":"note.md","content":"test"}',
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
          name: "write",
          arguments: { path: "note.md", content: "test" },
        },
      },
    }),
    _event({ type: "message_end", message: { role: "assistant" } }),
  ];
}

function _ids() {
  let value = 0;
  return () => `id-${++value}`;
}

function _clock() {
  let value = 100;
  return () => value++;
}
