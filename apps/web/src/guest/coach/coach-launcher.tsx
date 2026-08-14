import { Button } from "@llm-space/ui/ui/button";
import { BotIcon, SparklesIcon } from "lucide-react";
import { createPortal } from "react-dom";

import {
  getCoachSurfaceHint,
  type CoachSurfaceId,
} from "./coach-layout";

export interface CoachLauncherProps {
  surface: CoachSurfaceId;
  portalTarget: Element | null;
  onOpen: () => void;
}

export function CoachLauncher({
  surface,
  portalTarget,
  onOpen,
}: CoachLauncherProps) {
  const hint = getCoachSurfaceHint(surface);
  const launcher = (
    <div
      className={
        portalTarget
          ? "absolute right-3 bottom-3 z-30 flex max-w-[calc(100%-1.5rem)] items-center gap-2"
          : "fixed right-3 bottom-3 z-60 flex max-w-[calc(100%-1.5rem)] items-center gap-2"
      }
    >
      <button
        type="button"
        className="bg-popover text-popover-foreground hidden max-w-64 items-center gap-2 rounded-xl border px-3 py-2 text-left shadow-xl transition-colors hover:bg-accent sm:flex"
        onClick={onOpen}
      >
        <SparklesIcon className="size-3.5 shrink-0 text-violet-500" />
        <span className="min-w-0">
          <span className="block truncate text-[0.6875rem] font-semibold">
            {hint.label}
          </span>
          <span className="text-muted-foreground block truncate text-[0.625rem]">
            {hint.message}
          </span>
        </span>
      </button>
      <Button
        type="button"
        size="icon"
        className="relative size-12 shrink-0 rounded-full shadow-2xl"
        aria-label={`${hint.label}：打开 Agent 学习助手`}
        onClick={onOpen}
      >
        <BotIcon className="size-5" />
        <span className="absolute -top-0.5 -right-0.5 size-3 rounded-full border-2 border-background bg-violet-500" />
      </Button>
    </div>
  );

  return portalTarget ? createPortal(launcher, portalTarget) : launcher;
}
