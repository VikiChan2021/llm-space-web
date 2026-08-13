import { describe, expect, test } from "bun:test";

import { weatherLearningAnalyticsProperties } from "./learning-analytics";
import type { WeatherLearningProgress } from "./weather-learning-track";

describe("weather learning analytics", () => {
  test("allows only IDs, stage, step, and pause state", () => {
    const progress: WeatherLearningProgress = {
      version: 1,
      trackId: "weather-agent-v1",
      sessionId: "session-1",
      threadRecordId: "private-thread-id",
      stage: "inspect_tool",
      startedAt: "2026-08-14T00:00:00.000Z",
      updatedAt: "2026-08-14T00:01:00.000Z",
      baselineRunCount: 0,
      comparisonOpened: false,
      paused: false,
      promptCount: 0,
    };
    const properties = weatherLearningAnalyticsProperties(progress);
    expect(properties).toEqual({
      track_id: "weather-agent-v1",
      track_session_id: "session-1",
      stage: "inspect_tool",
      step: 3,
      paused: false,
    });
    expect(JSON.stringify(properties)).not.toContain("private-thread-id");
  });
});
