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
    evaluation_version: 1,
    case_count: 1,
    variant_count: 2,
    experiment_status: "draft",
    completed_items: 0,
  });
  expect(JSON.stringify(properties)).not.toContain("private prompt");
  expect(JSON.stringify(properties)).not.toContain("Secret experiment");
});
