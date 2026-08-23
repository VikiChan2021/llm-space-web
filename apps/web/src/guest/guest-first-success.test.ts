import { describe, expect, test } from "bun:test";

import type { Thread } from "@llm-space/core";

import { GuestRunError } from "./guest-api";
import {
  classifyGuestRunFailure,
  guestActivationAnalyticsProperties,
  guestRunPreparation,
  hasCompletedAgentLoop,
  initialGuestRunResult,
  loadGuestFirstSuccess,
  recordGuestFirstRunMode,
  recordGuestFirstSuccess,
  recordGuestRunRecovery,
  recoveryRunPreparation,
  saveGuestFirstSuccess,
  shouldOfferGuestFirstRun,
} from "./guest-first-success";

const factory = {
  createId: () => "activation-session-1",
  now: () => "2026-08-23T00:00:00.000Z",
};

describe("guest first success", () => {
  test("offers the mode choice once for an untouched weather starter", () => {
    const state = loadGuestFirstSuccess(_storage(), factory);
    const thread: Thread = { context: { messages: [] } };

    expect(
      shouldOfferGuestFirstRun({ state, starterId: "weather", thread })
    ).toBe(true);
    const chosen = recordGuestFirstRunMode(
      state,
      "complete",
      "2026-08-23T00:01:00.000Z"
    );
    expect(
      shouldOfferGuestFirstRun({ state: chosen, starterId: "weather", thread })
    ).toBe(false);
    expect(guestRunPreparation("complete")).toEqual({
      autoRunTools: true,
      reactLoop: true,
    });
    expect(guestRunPreparation("step")).toEqual({
      autoRunTools: false,
      reactLoop: false,
    });
  });

  test("recognizes a completed tool-to-final-answer loop", () => {
    const thread = _completedThread();
    expect(hasCompletedAgentLoop(thread)).toBe(true);
    expect(
      shouldOfferGuestFirstRun({
        state: loadGuestFirstSuccess(_storage(), factory),
        starterId: "weather",
        thread,
      })
    ).toBe(false);
  });

  test("binds the first-success callout to the completed thread", () => {
    const storage = _storage();
    const state = recordGuestFirstSuccess(
      loadGuestFirstSuccess(storage, factory),
      "completed-thread-id",
      "2026-08-23T00:01:30.000Z"
    );

    expect(saveGuestFirstSuccess(storage, state)).toBe(true);
    expect(loadGuestFirstSuccess(storage, factory)).toMatchObject({
      completedAt: "2026-08-23T00:01:30.000Z",
      completedThreadRecordId: "completed-thread-id",
    });
  });

  test("persists only a safe recovery summary and restores retry mode", () => {
    const storage = _storage();
    const state = loadGuestFirstSuccess(storage, factory);
    const next = recordGuestRunRecovery(
      state,
      "private-thread-id",
      {
        runId: "run-1",
        outcome: "failed",
        thread: { context: { messages: [] } },
        mode: { autoRunTools: true, reactLoop: true },
        result: {
          outcome: "failed",
          error: new GuestRunError("raw provider text", {
            code: "model_overloaded",
            status: 429,
            requestId: "request-secret-not-needed",
          }),
          partialOutput: true,
          retryFromMessageId: "message-1",
        },
        fromMessageId: "message-1",
      },
      "2026-08-23T00:02:00.000Z"
    );

    expect(saveGuestFirstSuccess(storage, next)).toBe(true);
    const serialized = storage.value ?? "";
    expect(serialized).not.toContain("raw provider text");
    expect(serialized).not.toContain("request-secret-not-needed");
    expect(recoveryRunPreparation(next, "private-thread-id", "message-1")).toEqual(
      { autoRunTools: true, reactLoop: true }
    );
    expect(initialGuestRunResult(next, "private-thread-id")).toMatchObject({
      outcome: "failed",
      partialOutput: true,
      retryFromMessageId: "message-1",
    });
  });

  test("analytics payload allowlists starter and never includes content", () => {
    const state = loadGuestFirstSuccess(_storage(), factory);
    const properties = guestActivationAnalyticsProperties({
      state,
      starterId: "user supplied title and prompt",
      mode: { autoRunTools: true, reactLoop: true },
      stage: "final_answer",
      elapsedMs: 1234.6,
      failureCategory: "service",
    });

    expect(properties).toEqual({
      activation_version: 1,
      activation_session_id: "activation-session-1",
      starter_id: "custom",
      run_mode: "complete",
      stage: "final_answer",
      failure_category: "service",
      elapsed_ms: 1235,
    });
    expect(JSON.stringify(properties)).not.toContain("title and prompt");
  });

  test("classifies guest errors without retaining their messages", () => {
    expect(
      classifyGuestRunFailure(
        new GuestRunError("private upstream message", {
          code: "guest_daily_limit",
          status: 429,
        })
      )
    ).toEqual({
      category: "quota",
      errorCode: "guest_daily_limit",
      status: 429,
    });
    expect(classifyGuestRunFailure(new TypeError("secret url"))).toEqual({
      category: "network",
    });
  });
});

function _storage() {
  return {
    value: null as string | null,
    getItem() {
      return this.value;
    },
    setItem(_key: string, value: string) {
      this.value = value;
    },
    removeItem() {
      this.value = null;
    },
  };
}

function _completedThread(): Thread {
  return {
    context: {
      messages: [
        {
          id: "user-1",
          role: "user",
          content: [{ type: "text", text: "天气" }],
        },
        {
          id: "assistant-tool",
          role: "assistant",
          content: [],
          toolCalls: [
            {
              id: "call-1",
              input: { name: "weather_report", arguments: { location: "广州" } },
              output: {
                content: [{ type: "text", text: "safe tool result" }],
                isError: false,
              },
            },
          ],
        },
        {
          id: "assistant-final",
          role: "assistant",
          content: [{ type: "text", text: "广州今天晴朗。" }],
        },
      ],
    },
  };
}
