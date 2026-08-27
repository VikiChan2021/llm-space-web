import { describe, expect, test } from "bun:test";

import type { ModelConfig, Thread } from "@llm-space/core";
import {
  EVALUATION_LAB_VERSION,
  createEvaluationExperiment,
  createNextEvaluationExperiment,
  type EvaluationLabRepository,
} from "@llm-space/core/thread";

import {
  GUEST_EVALUATION_LAB_STORAGE_KEY,
  saveGuestEvaluationLab,
} from "./guest-evaluation-lab";
import {
  createGuestPilotBundle,
  parseGuestPilotBundle,
  persistGuestPilotBundleImport,
  serializeGuestPilotBundle,
  type GuestPilotBundle,
} from "./guest-pilot-bundle";
import {
  createGuestWorkspace,
  GUEST_WORKSPACE_STORAGE_KEY,
  saveGuestWorkspace,
  type GuestWorkspaceFactory,
} from "./guest-workspace";

const MODEL: ModelConfig = {
  provider: "test",
  id: "model",
  params: { temperature: 0.2 },
};

const THREAD: Thread = {
  title: "Pilot",
  model: MODEL,
  context: {
    systemPrompt: "PRIVATE_PROMPT",
    messages: [
      {
        id: "message-1",
        role: "user",
        content: [{ type: "text", text: "PRIVATE_CASE_INPUT" }],
      },
    ],
  },
};

describe("guest pilot bundle", () => {
  test("round-trips one Thread and a continuous experiment ancestry", () => {
    const { repository, activeExperiment } = experimentChain();
    const serialized = serializeGuestPilotBundle({
      thread: THREAD,
      repository,
      activeExperiment,
      now: 1_000,
    });
    const bundle = parseGuestPilotBundle(serialized);

    expect(bundle.counts).toEqual({
      experiments: 2,
      cases: 1,
      runs: 0,
      evaluations: 0,
    });
    expect(bundle.experiments.map((item) => item.id)).toEqual([
      "parent-experiment",
      "child-experiment",
    ]);
    expect(bundle.thread.context?.systemPrompt).toBe("PRIVATE_PROMPT");
    expect(JSON.stringify(bundle.report)).not.toContain("PRIVATE_PROMPT");
    expect(JSON.stringify(bundle.report)).not.toContain("PRIVATE_CASE_INPUT");
  });

  test("imports with new ids, preserves internal lineage, and never overwrites", () => {
    const { repository, activeExperiment } = experimentChain();
    const bundle = createGuestPilotBundle({
      thread: THREAD,
      repository,
      activeExperiment,
      now: 1_000,
    });
    const storage = new MemoryStorage();
    const factory = sequentialFactory();
    const workspace = createGuestWorkspace(factory, THREAD);
    const existingRepository: EvaluationLabRepository = {
      version: EVALUATION_LAB_VERSION,
      activeExperimentId: repository.experiments[0].id,
      experiments: [repository.experiments[0]],
    };
    expect(saveGuestWorkspace(storage, workspace)).toBeNull();
    expect(saveGuestEvaluationLab(storage, existingRepository)).toBeNull();

    const result = persistGuestPilotBundleImport({
      storage,
      workspace,
      factory,
      bundle,
    });
    expect(result.ok).toBeTrue();
    if (!result.ok) return;
    expect(result.workspace.threads).toHaveLength(2);
    expect(result.workspace.activeThreadId).toBe(result.threadRecordId);
    expect(result.repository.experiments).toHaveLength(3);
    expect(result.repository.experiments[0].id).toBe("parent-experiment");
    expect(result.activeExperiment.id).not.toBe("child-experiment");
    const importedParent = result.repository.experiments.at(-2)!;
    expect(result.activeExperiment.lineage?.parentExperimentId).toBe(
      importedParent.id
    );
    expect(importedParent.id).not.toBe("parent-experiment");
  });

  test("rejects inconsistent Case Set, report, and evidence counts", () => {
    const { repository, activeExperiment } = experimentChain();
    const serialized = serializeGuestPilotBundle({
      thread: THREAD,
      repository,
      activeExperiment,
      now: 1_000,
    });
    const mutate = (update: (value: GuestPilotBundle) => void) => {
      const value = JSON.parse(serialized) as GuestPilotBundle;
      update(value);
      return JSON.stringify(value);
    };
    expect(() =>
      parseGuestPilotBundle(
        mutate((value) => {
          value.caseSet.cases[0].input = "changed";
        })
      )
    ).toThrow("Case Set");
    expect(() =>
      parseGuestPilotBundle(
        mutate((value) => {
          value.report.summary.unknown = 99;
        })
      )
    ).toThrow("脱敏报告");
    expect(() =>
      parseGuestPilotBundle(
        mutate((value) => {
          value.counts.experiments = 99;
        })
      )
    ).toThrow("证据计数");
    expect(() =>
      parseGuestPilotBundle(
        mutate((value) => {
          value.thread = {};
        })
      )
    ).toThrow("Thread");
  });

  test("restores the exact workspace bytes when the evaluation write fails", () => {
    const { repository, activeExperiment } = experimentChain();
    const bundle = createGuestPilotBundle({
      thread: THREAD,
      repository,
      activeExperiment,
      now: 1_000,
    });
    const storage = new MemoryStorage();
    const factory = sequentialFactory();
    const workspace = createGuestWorkspace(factory, THREAD);
    expect(saveGuestWorkspace(storage, workspace)).toBeNull();
    expect(
      saveGuestEvaluationLab(storage, {
        version: EVALUATION_LAB_VERSION,
        experiments: [],
      })
    ).toBeNull();
    const beforeWorkspace = storage.getItem(GUEST_WORKSPACE_STORAGE_KEY);
    const beforeEvaluation = storage.getItem(GUEST_EVALUATION_LAB_STORAGE_KEY);
    storage.failKey = GUEST_EVALUATION_LAB_STORAGE_KEY;

    const result = persistGuestPilotBundleImport({
      storage,
      workspace,
      factory,
      bundle,
    });
    expect(result).toEqual({
      ok: false,
      error:
        "评测数据无法写入浏览器存储。请导出实验后释放空间。 工作区已回滚。",
    });
    expect(storage.getItem(GUEST_WORKSPACE_STORAGE_KEY)).toBe(beforeWorkspace);
    expect(storage.getItem(GUEST_EVALUATION_LAB_STORAGE_KEY)).toBe(
      beforeEvaluation
    );
  });

  test("does not touch evaluation data when the workspace write fails", () => {
    const { repository, activeExperiment } = experimentChain();
    const bundle = createGuestPilotBundle({
      thread: THREAD,
      repository,
      activeExperiment,
      now: 1_000,
    });
    const storage = new MemoryStorage();
    const factory = sequentialFactory();
    const workspace = createGuestWorkspace(factory, THREAD);
    expect(saveGuestWorkspace(storage, workspace)).toBeNull();
    expect(
      saveGuestEvaluationLab(storage, {
        version: EVALUATION_LAB_VERSION,
        experiments: [],
      })
    ).toBeNull();
    const beforeEvaluation = storage.getItem(GUEST_EVALUATION_LAB_STORAGE_KEY);
    storage.failKey = GUEST_WORKSPACE_STORAGE_KEY;

    const result = persistGuestPilotBundleImport({
      storage,
      workspace,
      factory,
      bundle,
    });
    expect(result.ok).toBeFalse();
    expect(storage.getItem(GUEST_EVALUATION_LAB_STORAGE_KEY)).toBe(
      beforeEvaluation
    );
  });
});

function experimentChain(): {
  repository: EvaluationLabRepository;
  activeExperiment: EvaluationLabRepository["experiments"][number];
} {
  const parent = createEvaluationExperiment({
    thread: THREAD,
    model: MODEL,
    now: 100,
    createId: idFactory(["parent-experiment", "case-1"]),
  });
  const child = createNextEvaluationExperiment({
    parent,
    thread: THREAD,
    now: 200,
    createId: idFactory(["promotion-1", "child-experiment"]),
  });
  return {
    repository: {
      version: EVALUATION_LAB_VERSION,
      activeExperimentId: child.id,
      experiments: [parent, child],
    },
    activeExperiment: child,
  };
}

function idFactory(ids: string[]): () => string {
  return () => ids.shift() ?? "unexpected-id";
}

function sequentialFactory(): GuestWorkspaceFactory {
  let index = 0;
  return {
    createId: () => `generated-${++index}`,
    now: () => `2026-08-27T00:00:0${index}.000Z`,
  };
}

class MemoryStorage {
  readonly values = new Map<string, string>();
  failKey: string | null = null;

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    if (key === this.failKey) throw new Error("blocked");
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}
