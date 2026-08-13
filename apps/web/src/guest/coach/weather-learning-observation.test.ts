import { describe, expect, test } from "bun:test";

import type { Thread } from "@llm-space/core";

import {
  DEFAULT_WEATHER_REQUEST,
  observeWeatherLearning,
} from "./weather-learning-observation";

describe("observeWeatherLearning", () => {
  test("summarizes learning signals without returning message or tool content", () => {
    const thread: Thread = {
      title: "Weather",
      context: {
        messages: [
          {
            id: "user-1",
            role: "user",
            content: [{ type: "text", text: DEFAULT_WEATHER_REQUEST }],
          },
          {
            id: "assistant-1",
            role: "assistant",
            content: [],
            toolCalls: [
              {
                id: "tool-1",
                input: {
                  name: "weather_report",
                  arguments: { location: "广州" },
                },
              },
            ],
          },
        ],
      },
      runHistory: [
        {
          id: "run-1",
          timestamp: Date.parse("2026-08-14T00:00:00.000Z"),
          thread: { context: {} },
        },
      ],
    };
    const result = observeWeatherLearning("record-1", thread, false);
    expect(result).toEqual({
      threadRecordId: "record-1",
      runCount: 1,
      weatherToolCallCount: 1,
      completedWeatherToolCallCount: 0,
      pendingWeatherToolCallCount: 1,
      inputModified: false,
      running: false,
    });
    expect(JSON.stringify(result)).not.toContain("广州");
  });

  test("detects a changed starter request and completed tool output", () => {
    const thread: Thread = {
      context: {
        messages: [
          {
            id: "user-1",
            role: "user",
            content: [{ type: "text", text: "搜索一下深圳今天的天气" }],
          },
          {
            id: "assistant-1",
            role: "assistant",
            content: [],
            toolCalls: [
              {
                id: "tool-1",
                input: { name: "weather_report", arguments: {} },
                output: { content: [{ type: "text", text: "sunny" }] },
              },
            ],
          },
        ],
      },
    };
    expect(observeWeatherLearning("record-1", thread, false)).toMatchObject({
      completedWeatherToolCallCount: 1,
      pendingWeatherToolCallCount: 0,
      inputModified: true,
    });
  });
});
