export const WEATHER_LEARNING_STORAGE_KEY =
  "llm-space.guest.weather-learning.v1";

export type WeatherLearningStage =
  | "concepts"
  | "first_run"
  | "inspect_tool"
  | "change_input"
  | "second_run"
  | "compare"
  | "reflection"
  | "completed";

export interface WeatherLearningProgress {
  version: 1;
  trackId: "weather-agent-v1";
  sessionId: string;
  threadRecordId: string;
  stage: WeatherLearningStage;
  startedAt: string;
  updatedAt: string;
  baselineRunCount: number;
  firstRunCount?: number;
  comparisonOpened: boolean;
  paused: boolean;
  promptCount: number;
  lastPromptAt?: string;
}

export interface WeatherLearningObservation {
  threadRecordId: string;
  runCount: number;
  weatherToolCallCount: number;
  completedWeatherToolCallCount: number;
  pendingWeatherToolCallCount: number;
  inputModified: boolean;
  running: boolean;
}

export type WeatherLearningEvent =
  | {
      type: "start";
      threadRecordId: string;
      runCount: number;
      now: string;
      sessionId: string;
    }
  | { type: "concepts_acknowledged"; now: string }
  | { type: "observation"; observation: WeatherLearningObservation; now: string }
  | { type: "tool_trace_acknowledged"; observation: WeatherLearningObservation; now: string }
  | { type: "comparison_opened"; now: string }
  | { type: "comparison_acknowledged"; now: string }
  | { type: "reflection_answered"; correct: boolean; now: string }
  | { type: "pause"; now: string }
  | { type: "resume"; now: string }
  | { type: "prompt_shown"; now: string };

export interface WeatherLearningStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function reduceWeatherLearningProgress(
  current: WeatherLearningProgress | null,
  event: WeatherLearningEvent
): WeatherLearningProgress | null {
  if (event.type === "start") {
    return {
      version: 1,
      trackId: "weather-agent-v1",
      sessionId: event.sessionId,
      threadRecordId: event.threadRecordId,
      stage: "concepts",
      startedAt: event.now,
      updatedAt: event.now,
      baselineRunCount: event.runCount,
      comparisonOpened: false,
      paused: false,
      promptCount: 0,
    };
  }
  if (!current) return null;

  const update = (
    patch: Partial<WeatherLearningProgress>
  ): WeatherLearningProgress => ({ ...current, ...patch, updatedAt: event.now });

  if (event.type === "pause") return update({ paused: true });
  if (event.type === "resume") return update({ paused: false });
  if (event.type === "prompt_shown") {
    return update({
      promptCount: Math.min(3, current.promptCount + 1),
      lastPromptAt: event.now,
    });
  }
  if (current.paused) return current;

  if (event.type === "concepts_acknowledged" && current.stage === "concepts") {
    return update({ stage: "first_run" });
  }
  if (event.type === "observation") {
    if (event.observation.threadRecordId !== current.threadRecordId) {
      return current;
    }
    if (
      current.firstRunCount !== undefined &&
      event.observation.runCount < current.firstRunCount
    ) {
      return update({
        stage: "concepts",
        baselineRunCount: event.observation.runCount,
        firstRunCount: undefined,
        comparisonOpened: false,
      });
    }
    if (
      current.stage === "first_run" &&
      !event.observation.running &&
      event.observation.runCount > current.baselineRunCount
    ) {
      return update({
        stage: "inspect_tool",
        firstRunCount: event.observation.runCount,
      });
    }
    if (current.stage === "change_input" && event.observation.inputModified) {
      return update({ stage: "second_run" });
    }
    if (current.stage === "second_run" && !event.observation.inputModified) {
      return update({ stage: "change_input" });
    }
    if (
      current.stage === "second_run" &&
      !event.observation.running &&
      event.observation.runCount >
        (current.firstRunCount ?? current.baselineRunCount)
    ) {
      return update({ stage: "compare" });
    }
    return current;
  }
  if (
    event.type === "tool_trace_acknowledged" &&
    current.stage === "inspect_tool" &&
    event.observation.threadRecordId === current.threadRecordId &&
    event.observation.weatherToolCallCount > 0
  ) {
    return update({ stage: "change_input" });
  }
  if (event.type === "comparison_opened" && current.stage === "compare") {
    return update({ comparisonOpened: true });
  }
  if (
    event.type === "comparison_acknowledged" &&
    current.stage === "compare" &&
    current.comparisonOpened
  ) {
    return update({ stage: "reflection" });
  }
  if (
    event.type === "reflection_answered" &&
    current.stage === "reflection" &&
    event.correct
  ) {
    return update({ stage: "completed" });
  }
  return current;
}

export function loadWeatherLearningProgress(
  storage: WeatherLearningStorage
): WeatherLearningProgress | null {
  try {
    const raw = storage.getItem(WEATHER_LEARNING_STORAGE_KEY);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    return isWeatherLearningProgress(value) ? value : null;
  } catch {
    return null;
  }
}

export function saveWeatherLearningProgress(
  storage: WeatherLearningStorage,
  progress: WeatherLearningProgress
): void {
  try {
    storage.setItem(WEATHER_LEARNING_STORAGE_KEY, JSON.stringify(progress));
  } catch {
    // Learning progress is optional; the workbench remains usable without it.
  }
}

export function clearWeatherLearningProgress(
  storage: WeatherLearningStorage
): void {
  try {
    storage.removeItem(WEATHER_LEARNING_STORAGE_KEY);
  } catch {
    // See saveWeatherLearningProgress.
  }
}

export function canShowWeatherLearningPrompt(
  progress: WeatherLearningProgress,
  now: string
): boolean {
  if (progress.paused || progress.stage === "completed" || progress.promptCount >= 3) {
    return false;
  }
  if (!progress.lastPromptAt) return true;
  return Date.parse(now) - Date.parse(progress.lastPromptAt) >= 90_000;
}

export function weatherLearningStep(stage: WeatherLearningStage): number {
  if (stage === "concepts") return 1;
  if (stage === "first_run") return 2;
  if (stage === "inspect_tool") return 3;
  if (stage === "change_input" || stage === "second_run") return 4;
  if (stage === "compare" || stage === "reflection") return 5;
  return 6;
}

function isWeatherLearningProgress(
  value: unknown
): value is WeatherLearningProgress {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<WeatherLearningProgress>;
  return (
    candidate.version === 1 &&
    candidate.trackId === "weather-agent-v1" &&
    typeof candidate.sessionId === "string" &&
    typeof candidate.threadRecordId === "string" &&
    typeof candidate.stage === "string" &&
    [
      "concepts",
      "first_run",
      "inspect_tool",
      "change_input",
      "second_run",
      "compare",
      "reflection",
      "completed",
    ].includes(candidate.stage) &&
    typeof candidate.startedAt === "string" &&
    typeof candidate.updatedAt === "string" &&
    typeof candidate.baselineRunCount === "number" &&
    typeof candidate.comparisonOpened === "boolean" &&
    typeof candidate.paused === "boolean" &&
    typeof candidate.promptCount === "number"
  );
}
