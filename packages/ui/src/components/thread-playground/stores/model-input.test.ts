import { describe, expect, test } from "bun:test";
import type { Message } from "@llm-space/core";

import { prepareMessagesForModel } from "./model-input";

const MESSAGES: Message[] = [
  {
    id: "image-turn",
    role: "user",
    content: [
      { type: "image_data", mimeType: "image/png", data: "aA==" },
      { type: "text", text: "这是什么？" },
    ],
  },
  {
    id: "answer",
    role: "assistant",
    content: [{ type: "text", text: "一张图片。" }],
  },
  {
    id: "text-turn",
    role: "user",
    content: [{ type: "text", text: "你是谁？" }],
  },
];

describe("prepareMessagesForModel", () => {
  test("keeps the original multimodal context for vision models", () => {
    expect(prepareMessagesForModel(MESSAGES, true)).toBe(MESSAGES);
  });

  test("removes historical image bytes without blocking later text turns", () => {
    const prepared = prepareMessagesForModel(MESSAGES, false);
    expect(JSON.stringify(prepared)).not.toContain("image_data");
    expect(JSON.stringify(prepared)).toContain("图片未发送");
    expect(JSON.stringify(prepared)).toContain("你是谁？");
    expect(MESSAGES[0]?.content[0]?.type).toBe("image_data");
  });
});
