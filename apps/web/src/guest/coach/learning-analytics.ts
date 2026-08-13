import type { WeatherLearningProgress } from "./weather-learning-track";

export type WeatherLearningAnalyticsEvent =
  | "track_started"
  | "step_completed"
  | "track_paused"
  | "track_resumed"
  | "track_reset"
  | "track_completed"
  | "proactive_prompt_shown";

interface PostHogLike {
  capture(event: string, properties?: Record<string, unknown>): void;
}

declare global {
  interface Window {
    posthog?: PostHogLike;
  }
}

export function weatherLearningAnalyticsProperties(
  progress: WeatherLearningProgress
): Record<string, string | number | boolean> {
  return {
    track_id: progress.trackId,
    track_session_id: progress.sessionId,
    stage: progress.stage,
    step: weatherLearningAnalyticsStep(progress.stage),
    paused: progress.paused,
  };
}

export function captureWeatherLearningEvent(
  event: WeatherLearningAnalyticsEvent,
  progress: WeatherLearningProgress
): void {
  window.posthog?.capture(`guest_weather_learning_${event}`, {
    ...weatherLearningAnalyticsProperties(progress),
  });
}

function weatherLearningAnalyticsStep(stage: WeatherLearningProgress["stage"]): number {
  if (stage === "concepts") return 1;
  if (stage === "first_run") return 2;
  if (stage === "inspect_tool") return 3;
  if (stage === "change_input" || stage === "second_run") return 4;
  if (stage === "compare" || stage === "reflection") return 5;
  return 6;
}
