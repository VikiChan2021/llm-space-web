import { describe, expect, test } from "bun:test";

import { parseCoachAction } from "./coach-actions";

describe("学习助手动作注册表", () => {
  test("只接受注册过的语义元素", () => {
    expect(
      parseCoachAction("highlight_element", { elementId: "models" })
    ).toEqual({ name: "highlight_element", elementId: "models" });
    expect(
      parseCoachAction("highlight_element", {
        elementId: "body button:first-child",
      })
    ).toBeNull();
  });

  test("拒绝未注册动作", () => {
    expect(parseCoachAction("open_variables", {})).toEqual({
      name: "open_variables",
    });
    expect(parseCoachAction("request_run", {})).toEqual({
      name: "request_run",
    });
    expect(parseCoachAction("execute_javascript", {})).toBeNull();
  });
});
