import { describe, expect, test } from "bun:test";

import {
  buildPromptGenerationInput,
  detectPromptOutputLanguage,
} from "./system-prompt-language";

describe("system prompt output language", () => {
  test("requests Chinese output for a Chinese description", () => {
    expect(detectPromptOutputLanguage("你是一个物理学家。")).toBe("简体中文");
    expect(buildPromptGenerationInput("你是一个物理学家。")).toContain(
      "<output-language>简体中文</output-language>"
    );
  });

  test("falls back to the user's own language for Latin input", () => {
    expect(detectPromptOutputLanguage("You are a physicist.")).toBe(
      "与用户输入相同的语言"
    );
  });
});
