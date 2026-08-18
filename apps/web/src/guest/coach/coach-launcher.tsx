import { Button } from "@llm-space/ui/ui/button";
import { BotIcon, SparklesIcon } from "lucide-react";
import { createPortal } from "react-dom";

import { getCoachSurfaceHint, type CoachSurfaceId } from "./coach-layout";

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
  const dialogFooter = portalTarget?.querySelector(
    '[data-slot="dialog-footer"]'
  );
  const dialogLauncher = (
    <Button
      type="button"
      variant="outline"
      size="icon-sm"
      className={
        dialogFooter
          ? "relative sm:order-first sm:mr-auto"
          : "absolute top-2 right-11 z-30"
      }
      aria-label={`${hint.label}：打开 Agent 学习助手`}
      title="打开 Agent 学习助手"
      onClick={onOpen}
    >
      <BotIcon className="size-4" />
      <span className="border-background absolute -top-0.5 -right-0.5 size-2.5 rounded-full border-2 bg-violet-500" />
    </Button>
  );

  if (portalTarget) {
    return createPortal(dialogLauncher, dialogFooter ?? portalTarget);
  }

  const launcher = (
    <div className="fixed right-3 bottom-3 z-60 flex max-w-[calc(100%-1.5rem)] items-center gap-2">
      <button
        type="button"
        className="bg-popover text-popover-foreground hover:bg-accent hidden max-w-64 items-center gap-2 rounded-xl border px-3 py-2 text-left shadow-xl transition-colors sm:flex"
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
        <span className="border-background absolute -top-0.5 -right-0.5 size-3 rounded-full border-2 bg-violet-500" />
      </Button>
    </div>
  );

  return launcher;
}
