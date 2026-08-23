import { Button } from "@llm-space/ui/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@llm-space/ui/ui/dialog";
import { BugIcon, ShieldCheckIcon, SparklesIcon } from "lucide-react";

import type { GuestQuota } from "./guest-api";
import type { GuestFirstRunMode } from "./guest-first-success";

export function GuestFirstRunDialog({
  open,
  quota,
  onChoose,
  onCancel,
}: {
  open: boolean;
  quota: GuestQuota | null;
  onChoose: (mode: GuestFirstRunMode) => void;
  onCancel: () => void;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onCancel();
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>第一次运行：选择体验方式</DialogTitle>
          <DialogDescription>
            建议先完整体验一次 Agent 从模型调用工具、取得结果到整理最终答案的闭环。这个选择只影响本次运行。
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            autoFocus
            className="border-primary bg-primary/5 focus-visible:ring-ring rounded-lg border p-3 text-left outline-none transition-colors hover:bg-primary/10 focus-visible:ring-2"
            onClick={() => onChoose("complete")}
          >
            <span className="flex items-center gap-2 font-medium">
              <SparklesIcon className="size-4 text-primary" />
              完整运行（推荐）
            </span>
            <span className="text-muted-foreground mt-1 block text-xs/relaxed">
              自动运行安全工具并继续生成最终答案，适合第一次体验。
            </span>
          </button>
          <button
            type="button"
            className="hover:bg-muted focus-visible:ring-ring rounded-lg border p-3 text-left outline-none transition-colors focus-visible:ring-2"
            onClick={() => onChoose("step")}
          >
            <span className="flex items-center gap-2 font-medium">
              <BugIcon className="size-4" />
              逐步调试
            </span>
            <span className="text-muted-foreground mt-1 block text-xs/relaxed">
              模型发起工具调用后暂停，由你检查结果并决定下一步。
            </span>
          </button>
        </div>

        <div className="bg-muted/50 rounded-lg border px-3 py-2.5">
          <div className="flex items-start gap-2">
            <ShieldCheckIcon className="mt-0.5 size-4 shrink-0 text-emerald-500" />
            <div>
              <p className="font-medium">安全边界保持不变</p>
              <p className="text-muted-foreground mt-0.5">
                只自动执行游客白名单中的低风险工具；写入、Custom Tool、未知或未信任 MCP 仍会暂停等待确认。最多 6 个模型回合、8 次工具调用。
              </p>
            </div>
          </div>
          <p className="text-muted-foreground mt-2 border-t pt-2">
            {quota
              ? `当前剩余 ${Math.min(quota.browserRemaining, quota.ipRemaining)} 次免费 Run。完整运行的每个模型回合都会消耗一次。`
              : "额度状态暂不可用。完整运行的每个模型回合都会消耗一次免费 Run。"}
          </p>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onCancel}>
            取消
          </Button>
          <Button variant="outline" onClick={() => onChoose("step")}>
            逐步调试
          </Button>
          <Button onClick={() => onChoose("complete")}>
            完整运行（推荐）
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
