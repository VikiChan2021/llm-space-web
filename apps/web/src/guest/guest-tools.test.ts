import { beforeEach, describe, expect, test } from "bun:test";

import {
  canGuestAutoExecute,
  executeGuestTool,
  GUEST_BUILTIN_TOOLS,
} from "./guest-tools";

class MemoryStorage implements Storage {
  private readonly _values = new Map<string, string>();

  get length(): number {
    return this._values.size;
  }

  clear(): void {
    this._values.clear();
  }

  getItem(key: string): string | null {
    return this._values.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this._values.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this._values.delete(key);
  }

  setItem(key: string, value: string): void {
    this._values.set(key, value);
  }
}

beforeEach(() => {
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: new MemoryStorage(),
  });
});

describe("guest browser tools", () => {
  test("keeps every original category populated", () => {
    const names = new Set(GUEST_BUILTIN_TOOLS.map((tool) => tool.name));
    expect(names.has("read")).toBe(true);
    expect(names.has("web_search")).toBe(true);
    expect(names.has("todo_write")).toBe(true);
    expect(names.has("bash")).toBe(true);
    expect(names.has("skill")).toBe(true);
  });

  test("writes and reads only inside the browser virtual workspace", async () => {
    const write = GUEST_BUILTIN_TOOLS.find((tool) => tool.name === "write")!;
    const read = GUEST_BUILTIN_TOOLS.find((tool) => tool.name === "read")!;

    await executeGuestTool(
      write,
      { path: "drafts/answer.md", content: "hello" },
      "thread-a"
    );
    const result = await executeGuestTool(
      read,
      { path: "drafts/answer.md" },
      "thread-a"
    );

    expect(result.contentText).toBe("hello");
    await _expectToolFailure(
      executeGuestTool(read, { path: "../secret.txt" }, "thread-a"),
      "安全相对路径"
    );
    await _expectToolFailure(
      executeGuestTool(read, { path: "drafts/answer.md" }, "thread-b"),
      "不存在"
    );
  });

  test("auto-runs read-only tools but pauses writes and host capabilities", () => {
    const byName = new Map(
      GUEST_BUILTIN_TOOLS.map((tool) => [tool.name, tool])
    );
    expect(canGuestAutoExecute(byName.get("read")!)).toBe(true);
    expect(canGuestAutoExecute(byName.get("weather_report")!)).toBe(true);
    expect(canGuestAutoExecute(byName.get("write")!)).toBe(false);
    expect(canGuestAutoExecute(byName.get("bash")!)).toBe(false);
  });
});

async function _expectToolFailure(
  promise: Promise<unknown>,
  message: string
): Promise<void> {
  try {
    await promise;
    throw new Error("Expected tool call to fail");
  } catch (error) {
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain(message);
  }
}
