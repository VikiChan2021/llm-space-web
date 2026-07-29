import {
  CircleAlertIcon,
  CircleStopIcon,
  RotateCcwIcon,
  XIcon,
} from "lucide-react";
import { memo } from "react";

import { cn } from "@llm-space/ui/lib/utils";
import { Button } from "@llm-space/ui/ui/button";

import type { ThreadRunResult } from "./stores";

export interface RunRecoveryPresentation {
  tone: "danger" | "warning" | "info";
  title: string;
  description: string;
  retryable?: boolean;
  retryLabel?: string;
  details?: { label: string; value: string }[];
}

export interface ThreadRunRecoveryConfig {
  describeFailure: (error: unknown) => RunRecoveryPresentation;
  describeAbort: (context: {
    partialOutput: boolean;
  }) => RunRecoveryPresentation;
}

interface RunRecoveryBannerProps {
  result: ThreadRunResult;
  presentation: RunRecoveryPresentation;
  onRetry: () => void;
  onDismiss: () => void;
}

function _RunRecoveryBanner({
  result,
  presentation,
  onRetry,
  onDismiss,
}: RunRecoveryBannerProps) {
  const Icon =
    result.outcome === "aborted" ? CircleStopIcon : CircleAlertIcon;
  return (
    <div
      role="alert"
      className={cn(
        "mx-3 mt-3 flex shrink-0 items-start gap-2 rounded-lg border px-3 py-2 text-xs",
        presentation.tone === "danger" &&
          "border-destructive/30 bg-destructive/10",
        presentation.tone === "warning" &&
          "border-amber-500/30 bg-amber-500/10",
        presentation.tone === "info" &&
          "border-blue-500/30 bg-blue-500/10"
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0 grow">
        <div className="font-medium text-foreground">{presentation.title}</div>
        <div className="mt-0.5 text-muted-foreground">
          {presentation.description}
        </div>
        {presentation.details?.length ? (
          <details className="mt-1.5 text-muted-foreground">
            <summary className="w-fit cursor-pointer rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/30">
              技术详情
            </summary>
            <dl className="mt-1 grid gap-0.5 font-mono text-[0.6875rem]">
              {presentation.details.map((detail) => (
                <div key={detail.label} className="flex min-w-0 gap-2">
                  <dt className="shrink-0">{detail.label}</dt>
                  <dd className="min-w-0 break-all">{detail.value}</dd>
                </div>
              ))}
            </dl>
          </details>
        ) : null}
      </div>
      {presentation.retryable ? (
        <Button
          variant="outline"
          size="sm"
          className="shrink-0"
          onClick={onRetry}
        >
          <RotateCcwIcon />
          {presentation.retryLabel ?? "重新运行"}
        </Button>
      ) : null}
      <Button
        variant="ghost"
        size="icon-sm"
        className="shrink-0"
        aria-label="关闭 Run 结果"
        onClick={onDismiss}
      >
        <XIcon />
      </Button>
    </div>
  );
}

export const RunRecoveryBanner = memo(_RunRecoveryBanner);
