import { describe, expect, test } from "bun:test";

import { createOpenVariablesBridge } from "./web-action-bridge";

describe("Web Variables 动作桥", () => {
  test("把芯片和 Add 请求转发给当前活动工作台", () => {
    const bridge = createOpenVariablesBridge();
    const received: (string | undefined)[] = [];
    const unregister = bridge.register((name) => received.push(name));

    bridge.open("current_date");
    bridge.open();

    expect(received).toEqual(["current_date", undefined]);
    unregister();
    bridge.open("ignored");
    expect(received).toEqual(["current_date", undefined]);
  });

  test("旧工作台注销时不会清除新工作台处理器", () => {
    const bridge = createOpenVariablesBridge();
    const received: string[] = [];
    const unregisterOld = bridge.register(() => received.push("old"));
    bridge.register(() => received.push("new"));

    unregisterOld();
    bridge.open();

    expect(received).toEqual(["new"]);
  });
});
