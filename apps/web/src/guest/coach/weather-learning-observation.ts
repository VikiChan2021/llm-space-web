import { getMessageText, type Thread } from "@llm-space/core";

import type { WeatherLearningObservation } from "./weather-learning-track";

export const DEFAULT_WEATHER_REQUEST = "搜索一下广州今天的天气";

export function observeWeatherLearning(
  threadRecordId: string,
  thread: Thread,
  running: boolean
): WeatherLearningObservation {
  const messages = thread.context?.messages ?? [];
  const toolCalls = messages.flatMap((message) =>
    message.role === "assistant" ? (message.toolCalls ?? []) : []
  );
  const weatherToolCalls = toolCalls.filter(
    (toolCall) => toolCall.input.name === "weather_report"
  );
  const firstUserMessage = messages.find((message) => message.role === "user");
  const firstUserText = firstUserMessage ? getMessageText(firstUserMessage).trim() : "";
  return {
    threadRecordId,
    runCount: Math.max(
      thread.runHistory?.length ?? 0,
      thread.runHistoryIndex?.length ?? 0
    ),
    weatherToolCallCount: weatherToolCalls.length,
    completedWeatherToolCallCount: weatherToolCalls.filter(
      (toolCall) => toolCall.output && !toolCall.output.isError
    ).length,
    pendingWeatherToolCallCount: weatherToolCalls.filter(
      (toolCall) => !toolCall.output
    ).length,
    inputModified:
      firstUserText.length > 0 && firstUserText !== DEFAULT_WEATHER_REQUEST,
    running,
  };
}
