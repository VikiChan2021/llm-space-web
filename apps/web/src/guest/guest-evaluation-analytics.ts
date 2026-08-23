import type {
  EvaluationExperiment,
  EvaluationExperimentRun,
} from "@llm-space/core/thread";

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
  | "experiment_imported";

export function guestEvaluationAnalyticsProperties(input: {
  experiment?: EvaluationExperiment;
  result?: EvaluationExperimentRun;
  elapsedMs?: number;
}): Record<string, string | number | boolean> {
  const experiment = input.experiment;
  return {
    evaluation_version: 1,
    case_count: experiment?.cases.length ?? 0,
    variant_count: experiment ? 2 : 0,
    experiment_status: experiment?.status ?? "none",
    completed_items:
      experiment?.runs.filter((run) => run.status === "completed").length ?? 0,
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
