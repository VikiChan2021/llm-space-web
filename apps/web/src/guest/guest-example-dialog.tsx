import { Button } from "@llm-space/ui/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@llm-space/ui/ui/dialog";
import { ScrollArea } from "@llm-space/ui/ui/scroll-area";
import {
  ArrowRightIcon,
  BlocksIcon,
  SparklesIcon,
} from "lucide-react";

import { GUEST_EXAMPLES, type GuestExample } from "./guest-examples";

export interface GuestExampleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  running: boolean;
  creating: boolean;
  onSelect: (example: GuestExample) => void;
}

export function GuestExampleDialog({
  open,
  onOpenChange,
  running,
  creating,
  onSelect,
}: GuestExampleDialogProps) {
  const featured = GUEST_EXAMPLES.filter((example) => example.featured);
  const specialists = GUEST_EXAMPLES.filter((example) => !example.featured);
  const disabled = running || creating;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] max-w-[56rem]! gap-0 overflow-hidden border-border/80 bg-background/95 p-0 shadow-2xl backdrop-blur-xl">
        <DialogHeader className="relative overflow-hidden border-b px-5 py-4 text-left">
          <div
            aria-hidden
            className="pointer-events-none absolute -top-28 right-12 size-56 rounded-full bg-violet-500/10 blur-3xl"
          />
          <div className="relative flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-violet-500/25 bg-violet-500/10 text-violet-500">
              <SparklesIcon className="size-5" />
            </div>
            <div className="min-w-0">
              <DialogTitle className="text-xl font-semibold tracking-tight">
                选择一个 Agent 案例
              </DialogTitle>
              <DialogDescription className="mt-1 max-w-2xl text-xs leading-relaxed">
                每个案例都会创建独立 Thread，并预装对应 Prompt、消息和可用工具；创建后所有内容都可以修改和调试。
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <ScrollArea className="max-h-[calc(88vh-92px)]">
          <div className="space-y-6 p-5">
            <section aria-labelledby="featured-agent-examples">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3
                  id="featured-agent-examples"
                  className="text-muted-foreground text-[11px] font-semibold tracking-[0.16em] uppercase"
                >
                  推荐上手
                </h3>
                <span className="text-muted-foreground text-[11px]">
                  选择后立即创建
                </span>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                {featured.map((example) => (
                  <FeaturedCard
                    key={example.id}
                    example={example}
                    disabled={disabled}
                    onSelect={() => onSelect(example)}
                  />
                ))}
              </div>
            </section>

            <section aria-labelledby="all-agent-examples">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3
                  id="all-agent-examples"
                  className="text-muted-foreground flex items-center gap-2 text-[11px] font-semibold tracking-[0.16em] uppercase"
                >
                  <BlocksIcon className="size-3.5" />
                  更多调试场景
                </h3>
                <span className="text-muted-foreground text-[11px]">
                  {specialists.length} 个案例
                </span>
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                {specialists.map((example) => (
                  <SpecialistCard
                    key={example.id}
                    example={example}
                    disabled={disabled}
                    onSelect={() => onSelect(example)}
                  />
                ))}
              </div>
            </section>

            <div className="flex items-center justify-between gap-3 border-t pt-4 text-[11px] text-muted-foreground">
              <span>
                网页端使用浏览器虚拟文件与安全工具，不会访问你的设备文件。
              </span>
              {creating ? <span>正在创建案例…</span> : null}
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

function FeaturedCard({
  example,
  disabled,
  onSelect,
}: {
  example: GuestExample;
  disabled: boolean;
  onSelect: () => void;
}) {
  const Icon = example.icon;
  return (
    <Button
      type="button"
      variant="outline"
      disabled={disabled}
      className="group relative h-40 items-stretch justify-start overflow-hidden rounded-xl border-border/80 bg-gradient-to-br from-card via-card to-violet-500/10 p-4 text-left whitespace-normal transition hover:-translate-y-0.5 hover:border-violet-500/40 hover:shadow-lg"
      onClick={onSelect}
    >
      <div
        aria-hidden
        className="absolute -right-8 -bottom-10 size-32 rounded-full bg-violet-500/15 blur-2xl transition-transform group-hover:scale-125"
      />
      <div className="relative flex size-full flex-col">
        <div className="flex items-start justify-between gap-3">
          <span className="rounded-full border border-violet-500/25 bg-violet-500/10 px-2 py-0.5 text-[9px] font-semibold tracking-[0.12em] text-violet-600 uppercase dark:text-violet-300">
            {example.eyebrow}
          </span>
          <Icon className="size-6 text-violet-500" />
        </div>
        <div className="mt-auto">
          <h4 className="text-base font-semibold">{example.label}</h4>
          <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-muted-foreground">
            {example.description}
          </p>
        </div>
      </div>
    </Button>
  );
}

function SpecialistCard({
  example,
  disabled,
  onSelect,
}: {
  example: GuestExample;
  disabled: boolean;
  onSelect: () => void;
}) {
  const Icon = example.icon;
  return (
    <Button
      type="button"
      variant="outline"
      disabled={disabled}
      className="group h-auto min-h-20 justify-start gap-3 rounded-xl p-3 text-left whitespace-normal hover:border-violet-500/30 hover:bg-violet-500/5"
      onClick={onSelect}
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border bg-background text-muted-foreground group-hover:text-violet-500">
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{example.label}</span>
        <span className="mt-1 line-clamp-2 block text-xs leading-relaxed text-muted-foreground">
          {example.description}
        </span>
      </span>
      <ArrowRightIcon className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
    </Button>
  );
}
