import { describe, expect, test } from "bun:test";

import type { Thread } from "@llm-space/core";

import {
  addGuestThread,
  createGuestWorkspace,
  deleteGuestThread,
  duplicateGuestThread,
  GUEST_WORKSPACE_STORAGE_KEY,
  LEGACY_GUEST_THREAD_STORAGE_KEY,
  loadGuestWorkspace,
  parseGuestThreadImport,
  resetGuestThread,
  saveGuestWorkspace,
  selectGuestThread,
  serializeGuestThread,
  uniqueGuestThreadTitle,
  updateGuestThread,
  type GuestWorkspaceFactory,
  type GuestWorkspaceStorage,
} from "./guest-workspace";

class MemoryStorage implements GuestWorkspaceStorage {
  readonly values = new Map<string, string>();
  failReads = false;
  failWrites = false;

  getItem(key: string): string | null {
    if (this.failReads) throw new Error("storage blocked");
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    if (this.failWrites) throw new Error("quota exceeded");
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

function _factory(): GuestWorkspaceFactory {
  let sequence = 0;
  return {
    createId: () => `id-${++sequence}`,
    now: () => `2026-07-29T00:00:0${sequence}.000Z`,
  };
}

function _thread(title: string, text = title): Thread {
  return {
    title,
    context: {
      messages: [
        {
          id: `${title}-message`,
          role: "user",
          content: [{ type: "text", text }],
        },
      ],
    },
  };
}

describe("游客 Thread 工作区", () => {
  test("首次访问会立即创建并保存示例 Thread", () => {
    const storage = new MemoryStorage();
    const result = loadGuestWorkspace(storage, _factory());

    expect(result.workspace.threads).toHaveLength(1);
    expect(result.workspace.activeThreadId).toBe(result.workspace.threads[0].id);
    expect(result.workspace.threads[0].thread.title).toBe("游客体验工作台");
    expect(storage.values.has(GUEST_WORKSPACE_STORAGE_KEY)).toBe(true);
    expect(result.storageError).toBeNull();
  });

  test("旧版单 Thread 只在新工作区写入成功后删除", () => {
    const storage = new MemoryStorage();
    storage.values.set(
      LEGACY_GUEST_THREAD_STORAGE_KEY,
      JSON.stringify(_thread("旧版实验", "保留我"))
    );

    const result = loadGuestWorkspace(storage, _factory());

    expect(result.migratedLegacy).toBe(true);
    expect(result.workspace.threads[0].thread.title).toBe("旧版实验");
    expect(
      result.workspace.threads[0].thread.context?.messages?.[0].content?.[0]
    ).toEqual({ type: "text", text: "保留我" });
    expect(storage.values.has(LEGACY_GUEST_THREAD_STORAGE_KEY)).toBe(false);
  });

  test("迁移写入失败时保留旧键和内存 Thread", () => {
    const storage = new MemoryStorage();
    storage.values.set(
      LEGACY_GUEST_THREAD_STORAGE_KEY,
      JSON.stringify(_thread("不可丢失"))
    );
    storage.failWrites = true;

    const result = loadGuestWorkspace(storage, _factory());

    expect(result.workspace.threads[0].thread.title).toBe("不可丢失");
    expect(result.storageError).not.toBeNull();
    expect(storage.values.has(LEGACY_GUEST_THREAD_STORAGE_KEY)).toBe(true);
  });

  test("浏览器禁止读取存储时回退到内存示例且不崩溃", () => {
    const storage = new MemoryStorage();
    storage.failReads = true;

    const result = loadGuestWorkspace(storage, _factory());

    expect(result.workspace.threads).toHaveLength(1);
    expect(result.workspace.threads[0].thread.title).toBe("游客体验工作台");
    expect(result.storageError).toContain("禁止访问本地存储");
  });

  test("支持新建、选择、更新、复制和唯一标题", () => {
    const factory = _factory();
    let workspace = createGuestWorkspace(factory, _thread("实验"));
    workspace = addGuestThread(workspace, _thread("实验"), factory);

    expect(workspace.threads.map((record) => record.thread.title)).toEqual([
      "实验",
      "实验 (2)",
    ]);
    expect(uniqueGuestThreadTitle("实验", workspace.threads)).toBe("实验 (3)");

    workspace = selectGuestThread(workspace, workspace.threads[0].id);
    workspace = updateGuestThread(
      workspace,
      workspace.activeThreadId,
      _thread("已更新"),
      "2026-07-29T01:00:00.000Z"
    );
    workspace = duplicateGuestThread(
      workspace,
      workspace.activeThreadId,
      factory
    );

    const duplicate = workspace.threads.at(-1);
    if (!duplicate) throw new Error("复制后的 Thread 不存在");
    expect(duplicate.thread.title).toBe("已更新 副本");
    expect(workspace.activeThreadId).toBe(duplicate.id);
  });

  test("删除最后一个 Thread 后自动创建新示例", () => {
    const factory = _factory();
    const workspace = createGuestWorkspace(factory, _thread("唯一实验"));
    const next = deleteGuestThread(
      workspace,
      workspace.activeThreadId,
      factory
    );

    expect(next.threads).toHaveLength(1);
    expect(next.threads[0].thread.title).toBe("游客体验工作台");
    expect(next.activeThreadId).not.toBe(workspace.activeThreadId);
  });

  test("重置只替换内容并保留当前标题", () => {
    const factory = _factory();
    const workspace = createGuestWorkspace(factory, _thread("我的标题"));
    const next = resetGuestThread(
      workspace,
      workspace.activeThreadId,
      factory.createId,
      "2026-07-29T02:00:00.000Z"
    );

    expect(next.threads[0].thread.title).toBe("我的标题");
    expect(next.threads[0].thread.context?.systemPrompt).toContain("严谨");
  });

  test("导入复用默认解析器并导出原生 Thread JSON", async () => {
    const imported = await parseGuestThreadImport(
      "sample.json",
      JSON.stringify({
        messages: [{ role: "user", content: "从外部格式导入" }],
      })
    );

    expect(imported?.context?.messages?.[0].role).toBe("user");
    expect(serializeGuestThread(imported!)).toEndWith("\n");
    expect(JSON.parse(serializeGuestThread(imported!))).toEqual(imported!);
  });

  test("无效导入返回 undefined", async () => {
    expect(await parseGuestThreadImport("sample.txt", "{}")).toBeUndefined();
    expect(
      await parseGuestThreadImport("sample.json", "not-json")
    ).toBeUndefined();
  });

  test("存储失败返回中文错误且不破坏旧值", () => {
    const storage = new MemoryStorage();
    storage.values.set(GUEST_WORKSPACE_STORAGE_KEY, "known-good");
    storage.failWrites = true;
    const workspace = createGuestWorkspace(_factory(), _thread("新值"));

    const error = saveGuestWorkspace(storage, workspace);

    expect(error).toContain("尚未保存");
    expect(storage.values.get(GUEST_WORKSPACE_STORAGE_KEY)).toBe("known-good");
  });
});
