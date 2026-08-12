import { describe, expect, test } from "bun:test";

import type { Thread } from "@llm-space/core";
import type { SeedHost } from "@llm-space/ui/components/thread-playground/examples/prompts";

import {
  createGuestExampleThread,
  GUEST_EXAMPLES,
} from "./guest-examples";

const HOST = {
  paths: {
    ensureRootDir: async (path: string) => `/guest/${path}`,
  },
  skills: {
    getSettings: async () => ({ discoveryPaths: [] }),
    listAvailable: async () => [],
    listSkills: async () => [],
  },
} as SeedHost;

describe("游客 Agent 案例", () => {
  test("保留天气并迁移桌面端全部案例", () => {
    expect(GUEST_EXAMPLES).toHaveLength(9);
    expect(new Set(GUEST_EXAMPLES.map((example) => example.id)).size).toBe(9);
    expect(GUEST_EXAMPLES.map((example) => example.id)).toEqual([
      "weather",
      "blank",
      "general-agent",
      "deep-research",
      "translation",
      "deep-wiki",
      "compact-memory",
      "meta-prompt",
      "meta-image-prompt",
    ]);
  });

  test("9 个案例都能创建为可编辑 Thread", async () => {
    let sequence = 0;
    for (const example of GUEST_EXAMPLES) {
      const thread = await createGuestExampleThread(
        example.id,
        HOST,
        () => `message-${++sequence}`
      );
      expect(thread.title).toBe(example.label);
      expect(thread.context?.messages?.length).toBeGreaterThan(0);
      expect(typeof thread.context?.systemPrompt).toBe("string");
    }
  });

  test("Deep Research 带入 Prompt、消息与可执行 Web 工具", async () => {
    const thread = await createGuestExampleThread(
      "deep-research",
      HOST,
      () => "message-id",
      { provider: "bigmodel", id: "glm-4.7" }
    );

    expect(thread.title).toBe("Deep Research");
    expect(thread.model).toMatchObject({
      provider: "bigmodel",
      id: "glm-4.7",
    });
    expect(thread.context?.systemPrompt).toContain("research");
    expect(thread.context?.messages?.at(-1)?.content[0]).toEqual({
      type: "text",
      text: "What is Loop Engineering?",
    });
    expect(_toolNames(thread)).toEqual([
      "web_search",
      "web_fetch",
      "todo_write",
    ]);
  });

  test("General Agent 只保留网页游客端真实可运行的工具", async () => {
    const thread = await createGuestExampleThread(
      "general-agent",
      HOST,
      () => "message-id"
    );
    const toolNames = _toolNames(thread);

    expect(toolNames).toContain("web_search");
    expect(toolNames).toContain("read");
    expect(toolNames).toContain("skill");
    expect(toolNames).not.toContain("bash");
    expect(toolNames).not.toContain("ask_user_question");
    expect(toolNames).not.toContain("agent");
  });
});

function _toolNames(thread: Thread): string[] {
  return (thread.context?.tools ?? []).flatMap((tool) =>
    "name" in tool ? [tool.name] : []
  );
}
