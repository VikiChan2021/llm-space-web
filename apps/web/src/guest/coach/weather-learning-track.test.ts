import { describe, expect, test } from "bun:test";

import {
  WEATHER_LEARNING_STORAGE_KEY,
  canShowWeatherLearningPrompt,
  clearWeatherLearningProgress,
  loadWeatherLearningProgress,
  reduceWeatherLearningProgress,
  saveWeatherLearningProgress,
  type WeatherLearningObservation,
  type WeatherLearningProgress,
  type WeatherLearningStorage,
} from "./weather-learning-track";

const NOW = "2026-08-14T00:00:00.000Z";

function start(): WeatherLearningProgress {
  const progress = reduceWeatherLearningProgress(null, {
    type: "start",
    threadRecordId: "thread-1",
    runCount: 0,
    now: NOW,
    sessionId: "session-1",
  });
  if (!progress) throw new Error("expected progress");
  return progress;
}

function observation(
  patch: Partial<WeatherLearningObservation> = {}
): WeatherLearningObservation {
  return {
    threadRecordId: "thread-1",
    runCount: 0,
    weatherToolCallCount: 0,
    completedWeatherToolCallCount: 0,
    pendingWeatherToolCallCount: 0,
    inputModified: false,
    running: false,
    ...patch,
  };
}

describe("weather learning track", () => {
  test("starts without modifying the thread and records only learning metadata", () => {
    expect(start()).toEqual({
      version: 1,
      trackId: "weather-agent-v1",
      sessionId: "session-1",
      threadRecordId: "thread-1",
      stage: "concepts",
      startedAt: NOW,
      updatedAt: NOW,
      baselineRunCount: 0,
      comparisonOpened: false,
      paused: false,
      promptCount: 0,
    });
  });

  test("moves through concepts, a real first run, and a weather tool trace", () => {
    let progress = start();
    progress = reduceWeatherLearningProgress(progress, {
      type: "concepts_acknowledged",
      now: NOW,
    })!;
    expect(progress.stage).toBe("first_run");
    progress = reduceWeatherLearningProgress(progress, {
      type: "observation",
      observation: observation({ runCount: 1, weatherToolCallCount: 1 }),
      now: NOW,
    })!;
    expect(progress.stage).toBe("inspect_tool");
    expect(progress.firstRunCount).toBe(1);
    progress = reduceWeatherLearningProgress(progress, {
      type: "tool_trace_acknowledged",
      observation: observation({ runCount: 1, weatherToolCallCount: 1 }),
      now: NOW,
    })!;
    expect(progress.stage).toBe("change_input");
  });

  test("requires a changed input and a later run before comparison", () => {
    let progress: WeatherLearningProgress = {
      ...start(),
      stage: "change_input",
      firstRunCount: 1,
    };
    progress = reduceWeatherLearningProgress(progress, {
      type: "observation",
      observation: observation({ runCount: 1, inputModified: true }),
      now: NOW,
    })!;
    expect(progress.stage).toBe("second_run");
    progress = reduceWeatherLearningProgress(progress, {
      type: "observation",
      observation: observation({ runCount: 2, inputModified: true }),
      now: NOW,
    })!;
    expect(progress.stage).toBe("compare");
  });

  test("does not advance from another thread or while a run is active", () => {
    const firstRun = { ...start(), stage: "first_run" } as const;
    expect(
      reduceWeatherLearningProgress(firstRun, {
        type: "observation",
        observation: observation({ threadRecordId: "thread-2", runCount: 1 }),
        now: NOW,
      })
    ).toBe(firstRun);
    expect(
      reduceWeatherLearningProgress(firstRun, {
        type: "observation",
        observation: observation({ runCount: 1, running: true }),
        now: NOW,
      })
    ).toBe(firstRun);
  });

  test("recalibrates after the bound thread is reset", () => {
    const progress: WeatherLearningProgress = {
      ...start(),
      stage: "compare",
      firstRunCount: 1,
    };
    expect(
      reduceWeatherLearningProgress(progress, {
        type: "observation",
        observation: observation({ runCount: 0 }),
        now: NOW,
      })
    ).toMatchObject({
      stage: "concepts",
      baselineRunCount: 0,
      comparisonOpened: false,
    });
  });

  test("requires opening comparison and the correct reflection answer", () => {
    let progress: WeatherLearningProgress = { ...start(), stage: "compare" };
    progress = reduceWeatherLearningProgress(progress, {
      type: "comparison_acknowledged",
      now: NOW,
    })!;
    expect(progress.stage).toBe("compare");
    progress = reduceWeatherLearningProgress(progress, {
      type: "comparison_opened",
      now: NOW,
    })!;
    progress = reduceWeatherLearningProgress(progress, {
      type: "comparison_acknowledged",
      now: NOW,
    })!;
    expect(progress.stage).toBe("reflection");
    progress = reduceWeatherLearningProgress(progress, {
      type: "reflection_answered",
      correct: false,
      now: NOW,
    })!;
    expect(progress.stage).toBe("reflection");
    progress = reduceWeatherLearningProgress(progress, {
      type: "reflection_answered",
      correct: true,
      now: NOW,
    })!;
    expect(progress.stage).toBe("completed");
  });

  test("pause blocks stage transitions until resumed", () => {
    let progress = reduceWeatherLearningProgress(start(), {
      type: "pause",
      now: NOW,
    })!;
    expect(progress.paused).toBe(true);
    progress = reduceWeatherLearningProgress(progress, {
      type: "concepts_acknowledged",
      now: NOW,
    })!;
    expect(progress.stage).toBe("concepts");
    progress = reduceWeatherLearningProgress(progress, {
      type: "resume",
      now: NOW,
    })!;
    expect(progress.paused).toBe(false);
  });

  test("caps proactive prompts and enforces the 90-second cooldown", () => {
    const progress = {
      ...start(),
      promptCount: 1,
      lastPromptAt: NOW,
    };
    expect(
      canShowWeatherLearningPrompt(progress, "2026-08-14T00:01:29.999Z")
    ).toBe(false);
    expect(
      canShowWeatherLearningPrompt(progress, "2026-08-14T00:01:30.000Z")
    ).toBe(true);
    expect(canShowWeatherLearningPrompt({ ...progress, promptCount: 3 }, NOW)).toBe(
      false
    );
  });

  test("persists, restores, and clears versioned local progress", () => {
    const values = new Map<string, string>();
    const storage: WeatherLearningStorage = {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
      removeItem: (key) => values.delete(key),
    };
    saveWeatherLearningProgress(storage, start());
    expect(loadWeatherLearningProgress(storage)).toEqual(start());
    clearWeatherLearningProgress(storage);
    expect(values.has(WEATHER_LEARNING_STORAGE_KEY)).toBe(false);
  });

  test("ignores malformed stored progress", () => {
    const storage: WeatherLearningStorage = {
      getItem: () => JSON.stringify({ version: 2, prompt: "secret" }),
      setItem: () => undefined,
      removeItem: () => undefined,
    };
    expect(loadWeatherLearningProgress(storage)).toBeNull();
  });
});
