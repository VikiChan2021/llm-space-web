import { describe, expect, test } from "bun:test";

import type { ModelConfig, Thread } from "@llm-space/core";
import {
  aggregateEvaluationExperiment,
  buildEvaluationRunThread,
  createEvaluationExperiment,
  emptyEvaluationLabRepository,
  evaluateExperimentRun,
  evaluationBudget,
  normalizeEvaluationLabRepository,
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
    const baseline = buildEvaluationRunThread(
      value,
      firstCase,
      "baseline"
    );
    const candidate = buildEvaluationRunThread(
      value,
      firstCase,
      "candidate"
    );

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
    expect(evaluationBudget(20, 20)).toBe(18);
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
});
