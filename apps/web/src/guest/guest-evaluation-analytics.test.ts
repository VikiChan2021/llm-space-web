import { expect, test } from "bun:test";

import type { EvaluationExperiment } from "@llm-space/core/thread";

import { guestEvaluationAnalyticsProperties } from "./guest-evaluation-analytics";

test("evaluation analytics never includes experiment content", () => {
  const experiment = {
    id: "secret-id",
    name: "Secret experiment",
    cases: [{ input: "private prompt" }],
    runs: [],
    status: "draft",
  } as unknown as EvaluationExperiment;
  const properties = guestEvaluationAnalyticsProperties({ experiment });
  expect(properties).toEqual({
    evaluation_version: 2,
    case_count: 1,
    selected_case_count: 0,
    variant_count: 2,
    experiment_status: "draft",
    completed_items: 0,
    improved_cases: 0,
    regressed_cases: 0,
    unchanged_cases: 0,
    unknown_cases: 1,
  });
  expect(JSON.stringify(properties)).not.toContain("private prompt");
  expect(JSON.stringify(properties)).not.toContain("Secret experiment");
});
