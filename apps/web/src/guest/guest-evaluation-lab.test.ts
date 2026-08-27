import { describe, expect, test } from "bun:test";

import type { ModelConfig, Thread } from "@llm-space/core";
import {
  createEvaluationExperiment,
  type EvaluationExperiment,
} from "@llm-space/core/thread";

import {
  GUEST_EVALUATION_LAB_STORAGE_KEY,
  LEGACY_GUEST_EVALUATION_LAB_STORAGE_KEY,
  addGuestEvaluationExperiment,
  createGuestEvaluationReport,
  deleteGuestEvaluationExperiment,
  loadGuestEvaluationLab,
  parseGuestEvaluationCaseSetImport,
  parseGuestEvaluationLabImport,
  saveGuestEvaluationLab,
  serializeGuestEvaluationCaseSet,
  serializeGuestEvaluationLab,
  serializeGuestEvaluationReport,
  serializeGuestEvaluationReportHtml,
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
    removeItem: (key) => values.delete(key),
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
    expect(
      addGuestEvaluationExperiment(repository, draft("overflow"))
    ).toBeNull();
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

  test("migrates the legacy storage key only after a successful V2 write", () => {
    const values = new Map<string, string>();
    const storage: EvaluationLabStorage = {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
      removeItem: (key) => values.delete(key),
    };
    values.set(
      LEGACY_GUEST_EVALUATION_LAB_STORAGE_KEY,
      JSON.stringify({ version: 1, experiments: [draft("legacy")] })
    );
    const loaded = loadGuestEvaluationLab(storage);
    expect(loaded.repository.version).toBe(2);
    expect(values.has(GUEST_EVALUATION_LAB_STORAGE_KEY)).toBe(true);
    expect(values.has(LEGACY_GUEST_EVALUATION_LAB_STORAGE_KEY)).toBe(false);
  });

  test("round-trips a reusable Case Set", () => {
    const experiment = draft("case-set");
    const parsed = parseGuestEvaluationCaseSetImport(
      serializeGuestEvaluationCaseSet("Support regression", experiment.cases)
    );
    expect(parsed.name).toBe("Support regression");
    expect(parsed.cases).toEqual(experiment.cases);
  });

  test("exports redacted JSON and HTML quality-gate reports", () => {
    const experiment = draft("report");
    experiment.sourceThread.context!.systemPrompt =
      "SECRET_SYSTEM_PROMPT Authorization Bearer raw-secret";
    experiment.cases[0].input = "PRIVATE_CASE_INPUT";
    experiment.cases[0].name = "PRIVATE_CASE_NAME";
    experiment.runs = [
      completedReportRun("baseline", experiment.cases[0].id),
      completedReportRun("candidate", experiment.cases[0].id),
    ];
    const report = createGuestEvaluationReport(experiment, 0);
    expect(report.summary.unknown).toBe(1);
    expect(report.review).toMatchObject({
      eligiblePairs: 1,
      manualReviewed: 0,
      pending: 1,
      blocking: 1,
    });
    for (const output of [
      serializeGuestEvaluationReport(experiment, 0),
      serializeGuestEvaluationReportHtml(experiment, 0),
    ]) {
      expect(output).not.toContain("SECRET_SYSTEM_PROMPT");
      expect(output).not.toContain("PRIVATE_CASE_INPUT");
      expect(output).not.toContain("PRIVATE_CASE_NAME");
      expect(output).not.toContain("PRIVATE_MODEL_OUTPUT");
      expect(output).not.toContain("raw-secret");
    }
  });
});

function completedReportRun(
  variantId: "baseline" | "candidate",
  caseId: string
): EvaluationExperiment["runs"][number] {
  return {
    id: `${variantId}-result`,
    caseId,
    variantId,
    status: "completed",
    modelTurns: 1,
    durationMs: 100,
    toolNames: [],
    checks: [],
    run: {
      id: `${variantId}-snapshot`,
      timestamp: 100,
      thread: {
        model: MODEL,
        context: {
          messages: [
            {
              id: `${variantId}-assistant`,
              role: "assistant",
              content: [{ type: "text", text: "PRIVATE_MODEL_OUTPUT" }],
            },
          ],
        },
      },
    },
  };
}
