import { Button } from "@llm-space/ui/ui/button";
import { HistoryIcon, XIcon } from "lucide-react";

export function GuestFirstSuccessCallout({
  onOpenHistory,
  onDismiss,
}: {
  onOpenHistory: () => void;
  onDismiss: () => void;
}) {
  return (
    <section
      aria-label="首次完整运行已完成"
      className="mb-2 flex flex-wrap items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs"
    >
      <div className="min-w-48 flex-1">
        <p className="font-medium text-emerald-700 dark:text-emerald-300">
          已完成第一次完整 Agent 运行
        </p>
        <p className="text-muted-foreground mt-0.5">
          下一步打开运行记录，查看模型、工具调用、结果和本次 Run 快照。
        </p>
      </div>
      <Button size="sm" onClick={onOpenHistory}>
        <HistoryIcon className="size-3.5" />
        查看运行记录
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="关闭首次成功提示"
        onClick={onDismiss}
      >
        <XIcon />
      </Button>
    </section>
  );
}
