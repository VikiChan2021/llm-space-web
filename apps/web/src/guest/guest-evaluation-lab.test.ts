import { describe, expect, test } from "bun:test";

import type { ModelConfig, Thread } from "@llm-space/core";
import { createEvaluationExperiment } from "@llm-space/core/thread";

import {
  addGuestEvaluationExperiment,
  deleteGuestEvaluationExperiment,
  loadGuestEvaluationLab,
  parseGuestEvaluationLabImport,
  saveGuestEvaluationLab,
  serializeGuestEvaluationLab,
  type EvaluationLabStorage,
} from "./guest-evaluation-lab";

const MODEL: ModelConfig = { provider: "test", id: "model" };
const THREAD: Thread = {
  model: MODEL,
  context: {
    messages: [
      {
        id: "user-1",
        role: "user",
        content: [{ type: "text", text: "Hello" }],
      },
    ],
  },
};

function memoryStorage(): EvaluationLabStorage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
}

function draft(id: string) {
  let next = 0;
  return createEvaluationExperiment({
    thread: THREAD,
    model: MODEL,
    now: 100,
    createId: () => (next++ === 0 ? id : `${id}-${next}`),
  });
}

describe("guest evaluation lab repository", () => {
  test("persists, selects, deletes and round-trips one experiment", () => {
    const storage = memoryStorage();
    const loaded = loadGuestEvaluationLab(storage);
    const experiment = draft("experiment-1");
    const repository = addGuestEvaluationExperiment(
      loaded.repository,
      experiment
    );
    expect(repository?.activeExperimentId).toBe("experiment-1");
    expect(saveGuestEvaluationLab(storage, repository!)).toBeNull();
    expect(loadGuestEvaluationLab(storage).repository.experiments).toHaveLength(
      1
    );

    const imported = parseGuestEvaluationLabImport(
      serializeGuestEvaluationLab(experiment)
    );
    expect(imported.id).toBe("experiment-1");
    expect(
      deleteGuestEvaluationExperiment(repository!, "experiment-1").experiments
    ).toEqual([]);
  });

  test("never silently evicts the oldest experiment", () => {
    let repository = loadGuestEvaluationLab(memoryStorage()).repository;
    for (let index = 0; index < 10; index += 1) {
      repository = addGuestEvaluationExperiment(
        repository,
        draft(`experiment-${index}`)
      )!;
    }
    expect(addGuestEvaluationExperiment(repository, draft("overflow"))).toBeNull();
    expect(repository.experiments[0]?.id).toBe("experiment-0");
  });

  test("rejects invalid imports without touching existing data", () => {
    expect(() => parseGuestEvaluationLabImport("not-json")).toThrow(
      "不是有效 JSON"
    );
    expect(() =>
      parseGuestEvaluationLabImport(
        JSON.stringify({ format: "other", version: 1 })
      )
    ).toThrow("不受支持");
  });
});
