import type {
  RunRecoveryPresentation,
  ThreadRunRecoveryConfig,
} from "@llm-space/ui/components/thread-playground";

import { GuestRunError } from "./guest-api";

export const GUEST_RUN_RECOVERY: ThreadRunRecoveryConfig = {
  describeFailure: describeGuestRunFailure,
  describeAbort: ({ partialOutput }) => ({
    tone: "info",
    title: "运行已停止",
    description: partialOutput
      ? "已保留当前生成内容。重新运行会从原始用户消息开始。"
      : "Thread 已保留。你可以重新运行。",
    retryable: true,
  }),
};

export function describeGuestRunFailure(
  error: unknown
): RunRecoveryPresentation {
  if (error instanceof GuestRunError) {
    const details = _technicalDetails(error);
    if (error.code === "guest_daily_limit") {
      const reset = _formatResetTime(error.quota?.resetsAt);
      return {
        tone: "warning",
        title: "今日免费额度已用完",
        description: reset
          ? `额度将在 ${reset} 重置。BYOK 尚未开放。`
          : "BYOK 尚未开放，请等待免费额度重置。",
        details,
      };
    }
    if (
      error.code === "guest_concurrency_limit" ||
      error.code === "rate_limit" ||
      error.code === "model_overloaded"
    ) {
      return {
        tone: "warning",
        title: "运行请求过于频繁",
        description: "请等待当前 Run 结束或稍后再试。",
        retryable: true,
        details,
      };
    }
    if (
      error.status === 400 ||
      error.status === 403 ||
      error.status === 413 ||
      error.status === 415
    ) {
      return {
        tone: "warning",
        title: "请检查当前 Thread",
        description: error.message,
        details,
      };
    }
    return {
      tone: "danger",
      title: "模型服务暂时不可用",
      description:
        "Thread 已保留。请在 Models 中切换其他智谱模型后重试，或稍后重新运行。",
      retryable: true,
      details,
    };
  }

  if (error instanceof TypeError) {
    return {
      tone: "danger",
      title: "网络连接失败",
      description: "Thread 已保留。请检查网络后重新运行。",
      retryable: true,
    };
  }

  return {
    tone: "warning",
    title: "请检查当前 Thread",
    description:
      error instanceof Error
        ? error.message
        : "当前 Thread 暂时无法运行，请检查输入后再试。",
  };
}

function _technicalDetails(
  error: GuestRunError
): RunRecoveryPresentation["details"] {
  return [
    { label: "错误码", value: error.code },
    ...(error.status
      ? [{ label: "HTTP", value: String(error.status) }]
      : []),
    ...(error.requestId
      ? [{ label: "请求编号", value: error.requestId }]
      : []),
  ];
}

function _formatResetTime(value: string | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
