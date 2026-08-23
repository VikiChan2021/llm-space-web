import { getMessageText, type Thread } from "@llm-space/core";
import type {
  ThreadRunModeSnapshot,
  ThreadRunPreparation,
  ThreadRunResult,
  ThreadRunSettledEvent,
} from "@llm-space/ui/components/thread-playground";

import { GuestRunError } from "./guest-api";
import type { GuestWorkspaceStorage } from "./guest-workspace";

export const GUEST_FIRST_SUCCESS_STORAGE_KEY =
  "llm-space.guest.first-success.v1";

const FIRST_SUCCESS_VERSION = 1;
const SAFE_STARTER_IDS = new Set([
  "weather",
  "blank",
  "general-agent",
  "deep-research",
  "translation",
  "deep-wiki",
  "compact-memory",
  "meta-prompt",
  "meta-image-prompt",
]);

export type GuestFirstRunMode = "complete" | "step";
export type GuestActivationFailureCategory =
  | "quota"
  | "rate_limit"
  | "input"
  | "network"
  | "service"
  | "unknown";

export interface GuestFirstSuccessRecovery {
  outcome: "failed" | "aborted";
  category: GuestActivationFailureCategory;
  errorCode?: string;
  status?: number;
  partialOutput: boolean;
  retryFromMessageId?: string;
  threadRecordId: string;
  runMode: ThreadRunModeSnapshot;
  recordedAt: string;
}

export interface GuestFirstSuccessState {
  version: typeof FIRST_SUCCESS_VERSION;
  activationSessionId: string;
  startedAt: string;
  modeChoice?: GuestFirstRunMode;
  modeChosenAt?: string;
  completedAt?: string;
  completedThreadRecordId?: string;
  historyOpenedAt?: string;
  calloutDismissedAt?: string;
  recovery?: GuestFirstSuccessRecovery;
}

export interface GuestFirstSuccessFactory {
  createId: () => string;
  now: () => string;
}

export type GuestActivationEvent =
  | "session_started"
  | "mode_choice_shown"
  | "mode_selected"
  | "run_started"
  | "tool_result_observed"
  | "final_answer_completed"
  | "run_failed"
  | "run_aborted"
  | "run_history_opened";

interface PostHogLike {
  capture(event: string, properties?: Record<string, unknown>): void;
}

declare global {
  interface Window {
    posthog?: PostHogLike;
  }
}

export function loadGuestFirstSuccess(
  storage: GuestWorkspaceStorage,
  factory: GuestFirstSuccessFactory
): GuestFirstSuccessState {
  try {
    const raw = storage.getItem(GUEST_FIRST_SUCCESS_STORAGE_KEY);
    const parsed = raw ? _parseState(JSON.parse(raw) as unknown) : null;
    if (parsed) return parsed;
  } catch {
    // A fresh in-memory state keeps the workbench usable when storage is denied.
  }
  return {
    version: FIRST_SUCCESS_VERSION,
    activationSessionId: factory.createId(),
    startedAt: factory.now(),
  };
}

export function saveGuestFirstSuccess(
  storage: GuestWorkspaceStorage,
  state: GuestFirstSuccessState
): boolean {
  try {
    storage.setItem(GUEST_FIRST_SUCCESS_STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function shouldOfferGuestFirstRun(input: {
  state: GuestFirstSuccessState;
  starterId?: string;
  thread: Thread;
}): boolean {
  if (input.state.modeChoice || input.state.completedAt) return false;
  if (input.starterId !== "weather") return false;
  const runCount = Math.max(
    input.thread.runHistory?.length ?? 0,
    input.thread.runHistoryIndex?.length ?? 0
  );
  return runCount === 0 && !hasCompletedAgentLoop(input.thread);
}

export function guestRunPreparation(
  mode: GuestFirstRunMode
): ThreadRunPreparation {
  return mode === "complete"
    ? { autoRunTools: true, reactLoop: true }
    : { autoRunTools: false, reactLoop: false };
}

export function recordGuestFirstRunMode(
  state: GuestFirstSuccessState,
  mode: GuestFirstRunMode,
  now: string
): GuestFirstSuccessState {
  return {
    ...state,
    modeChoice: mode,
    modeChosenAt: now,
  };
}

export function recordGuestFirstSuccess(
  state: GuestFirstSuccessState,
  threadRecordId: string,
  now: string
): GuestFirstSuccessState {
  return {
    ...state,
    completedAt: state.completedAt ?? now,
    completedThreadRecordId:
      state.completedThreadRecordId ?? threadRecordId,
    recovery: undefined,
  };
}

export function recordGuestHistoryOpened(
  state: GuestFirstSuccessState,
  now: string
): GuestFirstSuccessState {
  return {
    ...state,
    historyOpenedAt: state.historyOpenedAt ?? now,
  };
}

export function dismissGuestFirstSuccessCallout(
  state: GuestFirstSuccessState,
  now: string
): GuestFirstSuccessState {
  return {
    ...state,
    calloutDismissedAt: state.calloutDismissedAt ?? now,
  };
}

export function recordGuestRunRecovery(
  state: GuestFirstSuccessState,
  threadRecordId: string,
  event: ThreadRunSettledEvent,
  now: string
): GuestFirstSuccessState {
  if (!event.result) return { ...state, recovery: undefined };
  const failure =
    event.result.outcome === "failed"
      ? classifyGuestRunFailure(event.result.error)
      : { category: "unknown" as const };
  return {
    ...state,
    recovery: {
      outcome: event.result.outcome,
      category: failure.category,
      ...(failure.errorCode ? { errorCode: failure.errorCode } : {}),
      ...(failure.status ? { status: failure.status } : {}),
      partialOutput: event.result.partialOutput,
      ...(event.result.retryFromMessageId
        ? { retryFromMessageId: event.result.retryFromMessageId }
        : {}),
      threadRecordId,
      runMode: event.mode,
      recordedAt: now,
    },
  };
}

export function clearGuestRunRecovery(
  state: GuestFirstSuccessState
): GuestFirstSuccessState {
  if (!state.recovery) return state;
  return { ...state, recovery: undefined };
}

export function initialGuestRunResult(
  state: GuestFirstSuccessState,
  threadRecordId: string
): ThreadRunResult | null {
  const recovery = state.recovery;
  if (recovery?.threadRecordId !== threadRecordId) return null;
  if (recovery.outcome === "aborted") {
    return {
      outcome: "aborted",
      partialOutput: recovery.partialOutput,
      ...(recovery.retryFromMessageId
        ? { retryFromMessageId: recovery.retryFromMessageId }
        : {}),
    };
  }
  return {
    outcome: "failed",
    error: _restoreSafeError(recovery),
    partialOutput: recovery.partialOutput,
    ...(recovery.retryFromMessageId
      ? { retryFromMessageId: recovery.retryFromMessageId }
      : {}),
  };
}

export function recoveryRunPreparation(
  state: GuestFirstSuccessState,
  threadRecordId: string,
  fromMessageId?: string
): ThreadRunPreparation | undefined {
  const recovery = state.recovery;
  if (
    recovery?.threadRecordId !== threadRecordId ||
    !fromMessageId ||
    recovery.retryFromMessageId !== fromMessageId
  ) {
    return undefined;
  }
  return recovery.runMode;
}

export function hasCompletedToolResult(thread: Thread): boolean {
  return (thread.context?.messages ?? []).some(
    (message) =>
      message.role === "assistant" &&
      message.toolCalls?.some((toolCall) =>
        Boolean(toolCall.output && !toolCall.output.isError)
      )
  );
}

export function hasCompletedAgentLoop(thread: Thread): boolean {
  const messages = thread.context?.messages ?? [];
  let completedToolIndex = -1;
  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index];
    if (
      message.role === "assistant" &&
      message.toolCalls?.some((toolCall) =>
        Boolean(toolCall.output && !toolCall.output.isError)
      )
    ) {
      completedToolIndex = index;
    }
  }
  if (completedToolIndex < 0) return false;
  return messages.slice(completedToolIndex + 1).some(
    (message) =>
      message.role === "assistant" && getMessageText(message).trim().length > 0
  );
}

export function classifyGuestRunFailure(error: unknown): {
  category: GuestActivationFailureCategory;
  errorCode?: string;
  status?: number;
} {
  if (error instanceof GuestRunError) {
    const errorCode = _safeErrorCode(error.code);
    if (error.code === "guest_daily_limit") {
      return { category: "quota", errorCode, status: error.status };
    }
    if (
      error.code === "guest_concurrency_limit" ||
      error.code === "rate_limit" ||
      error.code === "model_overloaded"
    ) {
      return { category: "rate_limit", errorCode, status: error.status };
    }
    if (
      error.status === 400 ||
      error.status === 403 ||
      error.status === 413 ||
      error.status === 415
    ) {
      return { category: "input", errorCode, status: error.status };
    }
    return { category: "service", errorCode, status: error.status };
  }
  if (error instanceof TypeError) return { category: "network" };
  return { category: "unknown" };
}

export function guestActivationAnalyticsProperties(input: {
  state: GuestFirstSuccessState;
  starterId?: string;
  mode?: GuestFirstRunMode | ThreadRunModeSnapshot;
  stage?: "first_run" | "tool_result" | "final_answer" | "history";
  failureCategory?: GuestActivationFailureCategory;
  elapsedMs?: number;
}): Record<string, string | number | boolean> {
  const properties: Record<string, string | number | boolean> = {
    activation_version: FIRST_SUCCESS_VERSION,
    activation_session_id: input.state.activationSessionId,
    starter_id:
      input.starterId && SAFE_STARTER_IDS.has(input.starterId)
        ? input.starterId
        : "custom",
  };
  if (input.mode) {
    properties.run_mode =
      typeof input.mode === "string"
        ? input.mode
        : input.mode.reactLoop
          ? "complete"
          : "step";
  }
  if (input.stage) properties.stage = input.stage;
  if (input.failureCategory) {
    properties.failure_category = input.failureCategory;
  }
  if (input.elapsedMs !== undefined) {
    properties.elapsed_ms = Math.max(0, Math.round(input.elapsedMs));
  }
  return properties;
}

export function captureGuestActivationEvent(
  event: GuestActivationEvent,
  input: Parameters<typeof guestActivationAnalyticsProperties>[0]
): void {
  window.posthog?.capture(
    `guest_activation_${event}`,
    guestActivationAnalyticsProperties(input)
  );
}

function _restoreSafeError(
  recovery: GuestFirstSuccessRecovery
): GuestRunError | TypeError | Error {
  if (recovery.category === "network") {
    return new TypeError("上一次运行因网络连接失败而中断。");
  }
  if (recovery.errorCode) {
    return new GuestRunError("上一次运行未完成，请按提示恢复。", {
      code: recovery.errorCode,
      status: recovery.status,
    });
  }
  return new Error("上一次运行未完成，请重新运行。");
}

function _safeErrorCode(value: string): string | undefined {
  return /^[a-z0-9_]{1,64}$/.test(value) ? value : undefined;
}

function _parseState(value: unknown): GuestFirstSuccessState | null {
  if (!_record(value) || value.version !== FIRST_SUCCESS_VERSION) return null;
  if (
    typeof value.activationSessionId !== "string" ||
    typeof value.startedAt !== "string"
  ) {
    return null;
  }
  const modeChoice =
    value.modeChoice === "complete" || value.modeChoice === "step"
      ? value.modeChoice
      : undefined;
  return {
    version: FIRST_SUCCESS_VERSION,
    activationSessionId: value.activationSessionId,
    startedAt: value.startedAt,
    ...(modeChoice ? { modeChoice } : {}),
    ...(typeof value.modeChosenAt === "string"
      ? { modeChosenAt: value.modeChosenAt }
      : {}),
    ...(typeof value.completedAt === "string"
      ? { completedAt: value.completedAt }
      : {}),
    ...(typeof value.completedThreadRecordId === "string"
      ? { completedThreadRecordId: value.completedThreadRecordId }
      : {}),
    ...(typeof value.historyOpenedAt === "string"
      ? { historyOpenedAt: value.historyOpenedAt }
      : {}),
    ...(typeof value.calloutDismissedAt === "string"
      ? { calloutDismissedAt: value.calloutDismissedAt }
      : {}),
    ...(_parseRecovery(value.recovery)
      ? { recovery: _parseRecovery(value.recovery)! }
      : {}),
  };
}

function _parseRecovery(value: unknown): GuestFirstSuccessRecovery | null {
  if (!_record(value)) return null;
  if (
    (value.outcome !== "failed" && value.outcome !== "aborted") ||
    !_isFailureCategory(value.category) ||
    typeof value.partialOutput !== "boolean" ||
    typeof value.threadRecordId !== "string" ||
    typeof value.recordedAt !== "string" ||
    !_record(value.runMode) ||
    typeof value.runMode.autoRunTools !== "boolean" ||
    typeof value.runMode.reactLoop !== "boolean"
  ) {
    return null;
  }
  return {
    outcome: value.outcome,
    category: value.category,
    ...(typeof value.errorCode === "string" && _safeErrorCode(value.errorCode)
      ? { errorCode: value.errorCode }
      : {}),
    ...(typeof value.status === "number" ? { status: value.status } : {}),
    partialOutput: value.partialOutput,
    ...(typeof value.retryFromMessageId === "string"
      ? { retryFromMessageId: value.retryFromMessageId }
      : {}),
    threadRecordId: value.threadRecordId,
    runMode: {
      autoRunTools: value.runMode.autoRunTools,
      reactLoop: value.runMode.reactLoop,
    },
    recordedAt: value.recordedAt,
  };
}

function _isFailureCategory(
  value: unknown
): value is GuestActivationFailureCategory {
  return (
    value === "quota" ||
    value === "rate_limit" ||
    value === "input" ||
    value === "network" ||
    value === "service" ||
    value === "unknown"
  );
}

function _record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
