import { describe, expect, test } from "bun:test";

import type { ModelConfig, Thread } from "@llm-space/core";
import {
  aggregateEvaluationExperiment,
  buildEvaluationRunThread,
  classifyEvaluationRegressions,
  createEvaluationCaseSet,
  createEvaluationExperiment,
  createNextEvaluationExperiment,
  emptyEvaluationLabRepository,
  evaluateExperimentRun,
  evaluationBudget,
  evaluationRerunTargets,
  normalizeEvaluationCaseSet,
  normalizeEvaluationLabRepository,
  planEvaluationPromotion,
  validateEvaluationSource,
  type EvaluationExperiment,
  type RunSnapshot,
} from "@llm-space/core/thread";

const MODEL: ModelConfig = {
  provider: "test",
  id: "model",
  params: { temperature: 0.5 },
};

const THREAD: Thread = {
  title: "Weather",
  model: MODEL,
  context: {
    systemPrompt: "Be accurate",
    messages: [
      {
        id: "user-1",
        role: "user",
        content: [{ type: "text", text: "Guangzhou weather" }],
      },
      {
        id: "assistant-old",
        role: "assistant",
        content: [{ type: "text", text: "Old result" }],
      },
    ],
  },
};

function experiment(): EvaluationExperiment {
  let index = 0;
  return createEvaluationExperiment({
    thread: THREAD,
    model: MODEL,
    now: 100,
    createId: () => `id-${++index}`,
  });
}

describe("evaluation experiment domain", () => {
  test("creates a bounded draft and builds isolated variant threads", () => {
    const value = experiment();
    const firstCase = value.cases[0]!;
    expect(value.name).toBe("Weather · 1970-01-01 评测");
    expect(firstCase.input).toBe("Guangzhou weather");

    firstCase.input = "Shenzhen weather";
    value.candidate.systemPrompt = "Be concise";
    const baseline = buildEvaluationRunThread(value, firstCase, "baseline");
    const candidate = buildEvaluationRunThread(value, firstCase, "candidate");

    expect(baseline.context?.messages).toHaveLength(1);
    expect(baseline.context?.messages?.[0]?.content[0]).toEqual({
      type: "text",
      text: "Shenzhen weather",
    });
    expect(baseline.context?.systemPrompt).toBe("Be accurate");
    expect(candidate.context?.systemPrompt).toBe("Be concise");
    expect(THREAD.context?.messages).toHaveLength(2);
  });

  test("budgets the worst case within the guest quota", () => {
    expect(evaluationBudget(1)).toBe(6);
    expect(evaluationBudget(3)).toBe(18);
    expect(evaluationBudget(20, 20)).toBe(120);
    expect(evaluationBudget(100, 1)).toBe(100);
  });

  test("checks output and tool evidence and aggregates completed runs", () => {
    const value = experiment();
    const firstCase = value.cases[0]!;
    firstCase.expectations = {
      requiredText: "sunny",
      forbiddenText: "rain",
      expectedToolName: "weather_report",
    };
    const run: RunSnapshot = {
      id: "run-1",
      timestamp: 200,
      usage: {
        input: 10,
        output: 5,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 15,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      },
      thread: {
        model: MODEL,
        context: {
          messages: [
            THREAD.context!.messages![0]!,
            {
              id: "assistant-1",
              role: "assistant",
              content: [{ type: "text", text: "Sunny today" }],
              toolCalls: [
                {
                  id: "tool-1",
                  input: { name: "weather_report", arguments: {} },
                  output: {
                    content: [{ type: "text", text: "sunny" }],
                  },
                },
              ],
            },
          ],
        },
      },
    };
    const evidence = evaluateExperimentRun(run, firstCase.expectations);
    expect(evidence.checks.map((check) => check.passed)).toEqual([
      true,
      true,
      true,
    ]);
    value.runs = [
      {
        id: "result-1",
        caseId: firstCase.id,
        variantId: "baseline",
        status: "completed",
        run,
        modelTurns: 2,
        durationMs: 1000,
        toolNames: evidence.toolNames,
        checks: evidence.checks,
      },
    ];
    expect(aggregateEvaluationExperiment(value)[0]).toMatchObject({
      completed: 1,
      checksPassed: 3,
      checksTotal: 3,
      averageTokens: 15,
      averageModelTurns: 2,
      averageDurationMs: 1000,
    });
  });

  test("normalizes repositories and rejects unsupported source content", () => {
    const value = experiment();
    const repository = normalizeEvaluationLabRepository({
      version: 1,
      activeExperimentId: value.id,
      experiments: [value],
    });
    expect(repository?.experiments).toHaveLength(1);
    expect(normalizeEvaluationLabRepository({ version: 2 })).toBeNull();
    expect(emptyEvaluationLabRepository().experiments).toEqual([]);

    expect(
      validateEvaluationSource({
        model: MODEL,
        context: {
          messages: [
            {
              id: "user-image",
              role: "user",
              content: [
                {
                  type: "image",
                  mimeType: "image/png",
                  data: "abc",
                },
              ],
            },
          ],
        },
      })
    ).toContain("纯文本");
  });

  test("migrates V1 repositories and preserves a bounded selected batch", () => {
    const value = experiment();
    const repository = normalizeEvaluationLabRepository({
      version: 1,
      activeExperimentId: value.id,
      experiments: [
        {
          ...value,
          selectedCaseIds: undefined,
          cases: Array.from({ length: 6 }, (_, index) => ({
            id: `case-${index}`,
            name: `Case ${index}`,
            input: `Input ${index}`,
            expectations: {},
          })),
        },
      ],
    });
    expect(repository?.version).toBe(2);
    expect(repository?.experiments[0]?.selectedCaseIds).toEqual([
      "case-0",
      "case-1",
      "case-2",
    ]);
  });

  test("round-trips versioned case sets up to fifty unique cases", () => {
    const cases = Array.from({ length: 55 }, (_, index) => ({
      id: `case-${index}`,
      name: `Case ${index}`,
      input: `Input ${index}`,
      expectations: {},
    }));
    const caseSet = createEvaluationCaseSet("Regression", cases);
    expect(caseSet.cases).toHaveLength(50);
    expect(normalizeEvaluationCaseSet(caseSet)).toEqual(caseSet);
    expect(
      normalizeEvaluationCaseSet({ ...caseSet, format: "other" })
    ).toBeNull();
  });

  test("plans an allowlisted promotion and creates immutable next-round lineage", () => {
    const value = experiment();
    value.candidate = {
      model: {
        ...MODEL,
        id: "candidate-model",
        params: { temperature: 0.2, maxTokens: 4096 },
      },
      systemPrompt: "Be concise",
    };
    const plan = planEvaluationPromotion(value, THREAD);
    expect(plan.status).toBe("ready");
    if (plan.status !== "ready") throw new Error("Expected ready plan");
    expect(plan.changes.map((change) => change.field)).toEqual([
      "model",
      "temperature",
      "maxTokens",
      "systemPrompt",
    ]);
    expect(plan.nextThread.context?.messages).toEqual(THREAD.context?.messages);
    const before = structuredClone(value);
    let index = 0;
    const next = createNextEvaluationExperiment({
      parent: value,
      thread: plan.nextThread,
      now: 500,
      createId: () => `next-${++index}`,
    });
    expect(next.lineage).toEqual({
      parentExperimentId: value.id,
      promotionId: "next-1",
      promotedAt: 500,
    });
    expect(next.cases.map((item) => item.id)).toEqual(
      value.cases.map((item) => item.id)
    );
    expect(value).toEqual(before);
  });

  test("blocks stale promotion fields without treating unrelated messages as conflicts", () => {
    const value = experiment();
    value.candidate.systemPrompt = "Be concise";
    const unrelatedMessage = structuredClone(THREAD);
    unrelatedMessage.context!.messages = [
      ...unrelatedMessage.context!.messages!,
      {
        id: "assistant-new",
        role: "assistant",
        content: [{ type: "text", text: "New result" }],
      },
    ];
    expect(planEvaluationPromotion(value, unrelatedMessage).status).toBe(
      "ready"
    );
    const stale = structuredClone(THREAD);
    stale.context!.systemPrompt = "Changed outside evaluation";
    const plan = planEvaluationPromotion(value, stale);
    expect(plan.status).toBe("conflict");
    if (plan.status === "conflict") {
      expect(plan.conflictFields).toEqual(["systemPrompt"]);
    }
  });

  test("classifies deterministic regressions and selects only failed or regressed reruns", () => {
    const value = experiment();
    const caseId = value.cases[0]!.id;
    const baselineRun = completedRun("baseline-run", "baseline", caseId, [
      true,
      true,
    ]);
    const candidateRun = completedRun("candidate-run", "candidate", caseId, [
      true,
      false,
    ]);
    value.runs = [baselineRun, candidateRun];
    expect(classifyEvaluationRegressions(value)[0]).toMatchObject({
      status: "regressed",
      checkDelta: -1,
    });
    expect(evaluationRerunTargets(value)).toEqual([
      { caseId, variantId: "baseline" },
      { caseId, variantId: "candidate" },
    ]);
    value.runs[1] = { ...candidateRun, status: "failed" };
    expect(evaluationRerunTargets(value)).toEqual([
      { caseId, variantId: "candidate" },
    ]);
  });
});

function completedRun(
  id: string,
  variantId: "baseline" | "candidate",
  caseId: string,
  checks: boolean[]
): EvaluationExperiment["runs"][number] {
  return {
    id,
    caseId,
    variantId,
    status: "completed",
    modelTurns: variantId === "baseline" ? 2 : 1,
    durationMs: variantId === "baseline" ? 1000 : 800,
    toolNames: [],
    checks: checks.map((passed, index) => ({
      type: "required_text",
      label: `Check ${index}`,
      passed,
    })),
    run: {
      id: `${id}-snapshot`,
      timestamp: 200,
      usage: {
        input: 10,
        output: variantId === "baseline" ? 10 : 5,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: variantId === "baseline" ? 20 : 15,
        cost: {
          input: 0,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
          total: 0,
        },
      },
      thread: {
        model: MODEL,
        context: {
          messages: [
            {
              id: `${id}-assistant`,
              role: "assistant",
              content: [{ type: "text", text: id }],
            },
          ],
        },
      },
    },
  };
}
