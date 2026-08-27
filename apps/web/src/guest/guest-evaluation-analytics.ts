import type {
  EvaluationExperiment,
  EvaluationExperimentRun,
} from "@llm-space/core/thread";
import { classifyEvaluationRegressions } from "@llm-space/core/thread";

interface PostHogLike {
  capture(event: string, properties?: Record<string, unknown>): void;
}

declare global {
  interface Window {
    posthog?: PostHogLike;
  }
}

export type GuestEvaluationEvent =
  | "lab_opened"
  | "experiment_created"
  | "experiment_started"
  | "experiment_stopped"
  | "experiment_completed"
  | "trace_opened"
  | "experiment_exported"
  | "experiment_imported"
  | "case_set_imported"
  | "case_set_exported"
  | "report_exported"
  | "regression_rerun_started"
  | "promotion_diff_opened"
  | "promotion_applied"
  | "next_round_created";

export function guestEvaluationAnalyticsProperties(input: {
  experiment?: EvaluationExperiment;
  result?: EvaluationExperimentRun;
  elapsedMs?: number;
}): Record<string, string | number | boolean> {
  const experiment = input.experiment;
  const regressionSummary = experiment
    ? classifyEvaluationRegressions(experiment).reduce(
        (summary, item) => {
          summary[item.status] += 1;
          return summary;
        },
        { improved: 0, regressed: 0, unchanged: 0, unknown: 0 }
      )
    : { improved: 0, regressed: 0, unchanged: 0, unknown: 0 };
  return {
    evaluation_version: 2,
    case_count: experiment?.cases.length ?? 0,
    selected_case_count: experiment?.selectedCaseIds?.length ?? 0,
    variant_count: experiment ? 2 : 0,
    experiment_status: experiment?.status ?? "none",
    completed_items:
      experiment?.runs.filter((run) => run.status === "completed").length ?? 0,
    improved_cases: regressionSummary.improved,
    regressed_cases: regressionSummary.regressed,
    unchanged_cases: regressionSummary.unchanged,
    unknown_cases: regressionSummary.unknown,
    ...(input.result
      ? {
          result_status: input.result.status,
          result_variant: input.result.variantId,
          result_model_turns: input.result.modelTurns,
        }
      : {}),
    ...(input.elapsedMs === undefined
      ? {}
      : { elapsed_ms: Math.max(0, Math.round(input.elapsedMs)) }),
  };
}

export function captureGuestEvaluationEvent(
  event: GuestEvaluationEvent,
  input: Parameters<typeof guestEvaluationAnalyticsProperties>[0] = {}
): void {
  window.posthog?.capture(
    `guest_evaluation_${event}`,
    guestEvaluationAnalyticsProperties(input)
  );
}
