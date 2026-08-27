import {
  runResultText,
  summarizeRun,
  type EvaluationExperiment,
  type EvaluationRecord,
  type EvaluationReviewItem,
  type EvaluationReviewSummary,
  type RunSnapshot,
} from "@llm-space/core/thread";
import { RunTraceView } from "@llm-space/ui/components/thread-playground";
import { cn } from "@llm-space/ui/lib/utils";
import { Button } from "@llm-space/ui/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@llm-space/ui/ui/dialog";
import {
  ArrowLeftIcon,
  CheckCircle2Icon,
  EyeIcon,
  KeyboardIcon,
  ShieldAlertIcon,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

const REVIEW_ACTIONS: {
  key: "a" | "b" | "e" | "f";
  shortcut: string;
  verdict: EvaluationRecord["verdict"];
  label: string;
  description: string;
}[] = [
  {
    key: "a",
    shortcut: "A",
    verdict: "leftBetter",
    label: "Baseline 更好",
    description: "Candidate 会被标记为回归。",
  },
  {
    key: "b",
    shortcut: "B",
    verdict: "rightBetter",
    label: "Candidate 更好",
    description: "Candidate 会被标记为改进。",
  },
  {
    key: "e",
    shortcut: "E",
    verdict: "tie",
    label: "表现相同",
    description: "两侧质量没有明显变化。",
  },
  {
    key: "f",
    shortcut: "F",
    verdict: "fail",
    label: "两边都失败",
    description: "评审完成，但该 Case 继续阻止晋升。",
  },
];

export function GuestEvaluationReviewQueueDialog({
  open,
  experiment,
  items,
  summary,
  onOpenChange,
  onSaveVerdict,
}: {
  open: boolean;
  experiment: EvaluationExperiment;
  items: EvaluationReviewItem[];
  summary: EvaluationReviewSummary;
  onOpenChange: (open: boolean) => void;
  onSaveVerdict: (
    item: EvaluationReviewItem,
    verdict: EvaluationRecord["verdict"]
  ) => boolean;
}) {
  const pendingItems = items.filter((item) => item.needsReview);
  const current = pendingItems[0] ?? null;
  const evaluationCase = experiment.cases.find(
    (item) => item.id === current?.caseId
  );
  const [inspectingRun, setInspectingRun] = useState<RunSnapshot | null>(null);
  const identity = `${experiment.id}:${current?.caseId ?? "complete"}`;
  const [previousIdentity, setPreviousIdentity] = useState(identity);

  if (identity !== previousIdentity) {
    setPreviousIdentity(identity);
    setInspectingRun(null);
  }

  const saveVerdict = useCallback(
    (verdict: EvaluationRecord["verdict"]) => {
      if (!current) return;
      if (!onSaveVerdict(current, verdict)) {
        toast.error("无法保存人工评审", {
          description: "请确认两侧运行证据仍然完整。",
        });
        return;
      }
      if (verdict === "fail") {
        toast.warning("已记录：两边都失败。", {
          description: "该 Case 仍会阻止 Candidate 晋升。",
        });
      } else {
        toast.success("人工评审已保存，正在进入下一条。", {
          description: "可在 Case 的“人工评分”中修改已保存结论。",
        });
      }
    },
    [current, onSaveVerdict]
  );

  useEffect(() => {
    if (!open || !current || inspectingRun) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.repeat
      ) {
        return;
      }
      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      ) {
        return;
      }
      const action = REVIEW_ACTIONS.find(
        (item) => item.key === event.key.toLowerCase()
      );
      if (!action) return;
      event.preventDefault();
      saveVerdict(action.verdict);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [current, inspectingRun, open, saveVerdict]);

  const baselineRun = current?.baseline.run ?? null;
  const candidateRun = current?.candidate.run ?? null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-coach-surface="evaluation"
        className="flex h-[100dvh] w-screen max-w-none flex-col gap-0 overflow-hidden rounded-none p-0 sm:h-[88vh] sm:w-[min(960px,92vw)] sm:max-w-none sm:rounded-xl"
      >
        <DialogHeader className="shrink-0 border-b px-4 py-3 pr-12">
          <div className="flex flex-wrap items-center gap-2">
            <DialogTitle>人工评审队列</DialogTitle>
            <span className="bg-primary/15 text-primary rounded px-1.5 py-0.5 text-[0.625rem] font-semibold">
              Review Queue V1
            </span>
          </div>
          <DialogDescription>
            {inspectingRun
              ? "只读查看当前比较的运行证据。"
              : `已人工评审 ${summary.manualReviewed} · 自动判定 ${summary.automatic} · 待评审 ${summary.pending}`}
          </DialogDescription>
        </DialogHeader>

        {inspectingRun ? (
          <>
            <RunTraceView className="min-h-0 flex-1" run={inspectingRun} />
            <div className="flex justify-end border-t px-4 py-3">
              <Button variant="ghost" onClick={() => setInspectingRun(null)}>
                <ArrowLeftIcon /> 返回评审
              </Button>
            </div>
          </>
        ) : current && baselineRun && candidateRun && evaluationCase ? (
          <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
            <section className="bg-muted/20 rounded-xl border p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-muted-foreground text-xs">
                    当前 Case · 剩余 {summary.pending}
                  </div>
                  <h3 className="mt-1 font-medium">{evaluationCase.name}</h3>
                </div>
                <span className="rounded-full border border-amber-500/30 px-2 py-1 text-xs text-amber-300">
                  unknown
                </span>
              </div>
              <div className="mt-3">
                <div className="text-muted-foreground text-xs">用户输入</div>
                <p className="mt-1 text-sm whitespace-pre-wrap">
                  {evaluationCase.input}
                </p>
              </div>
              <p className="text-muted-foreground mt-3 text-xs">
                {current.regression.reason}
              </p>
            </section>

            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <ReviewEvidenceCard
                title="Baseline"
                run={current.baseline}
                snapshot={baselineRun}
                onInspect={() => setInspectingRun(baselineRun)}
              />
              <ReviewEvidenceCard
                title="Candidate"
                run={current.candidate}
                snapshot={candidateRun}
                onInspect={() => setInspectingRun(candidateRun)}
              />
            </div>

            <section className="mt-4 rounded-xl border p-4">
              <div className="flex items-center gap-2 font-medium">
                <KeyboardIcon className="size-4" /> 选择人工结论
              </div>
              <p className="text-muted-foreground mt-1 text-xs">
                保存后自动进入下一条；快捷键在输入框外生效。
              </p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {REVIEW_ACTIONS.map((action) => (
                  <Button
                    key={action.verdict}
                    variant="outline"
                    className="h-auto items-start justify-start px-3 py-3 text-left whitespace-normal"
                    aria-keyshortcuts={action.shortcut}
                    onClick={() => saveVerdict(action.verdict)}
                  >
                    <span className="bg-muted mr-2 inline-flex size-6 shrink-0 items-center justify-center rounded border font-mono text-xs">
                      {action.shortcut}
                    </span>
                    <span>
                      <span className="block font-medium">{action.label}</span>
                      <span className="text-muted-foreground mt-0.5 block text-xs font-normal">
                        {action.description}
                      </span>
                    </span>
                  </Button>
                ))}
              </div>
            </section>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
            {summary.blocking > 0 ? (
              <ShieldAlertIcon className="size-10 text-amber-400" />
            ) : (
              <CheckCircle2Icon className="size-10 text-emerald-400" />
            )}
            <div className="font-medium">待人工评审已清空</div>
            <p className="text-muted-foreground max-w-md text-sm">
              {summary.blocking > 0
                ? `仍有 ${summary.blocking} 个 Case 阻止晋升，通常是确定性回归或“两边都失败”。请返回实验结果重跑或修复。`
                : "所有不确定 Case 都已解决，质量门禁可以进入 Candidate 晋升确认。"}
            </p>
            <Button onClick={() => onOpenChange(false)}>返回实验结果</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ReviewEvidenceCard({
  title,
  run,
  snapshot,
  onInspect,
}: {
  title: "Baseline" | "Candidate";
  run: EvaluationReviewItem["baseline"];
  snapshot: RunSnapshot;
  onInspect: () => void;
}) {
  const checksPassed = run.checks.filter((check) => check.passed).length;
  return (
    <section className="bg-card/40 min-w-0 rounded-xl border">
      <div className="flex items-start justify-between gap-3 border-b p-3">
        <div className="min-w-0">
          <div className="font-medium">{title}</div>
          <div className="text-muted-foreground mt-1 truncate font-mono text-xs">
            {summarizeRun(snapshot.thread)}
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={onInspect}>
          <EyeIcon /> Trace
        </Button>
      </div>
      <div className="grid grid-cols-3 gap-2 border-b p-3 text-xs">
        <Metric label="规则" value={`${checksPassed}/${run.checks.length}`} />
        <Metric label="回合" value={String(run.modelTurns)} />
        <Metric label="耗时" value={formatDuration(run.durationMs)} />
      </div>
      <div className="p-3">
        <div className="text-muted-foreground text-xs">模型输出</div>
        <p className="mt-2 max-h-44 overflow-auto text-sm whitespace-pre-wrap">
          {runResultText(snapshot.thread) || "没有可显示的文本输出。"}
        </p>
        {run.checks.length > 0 ? (
          <div className="mt-3 grid gap-1.5">
            {run.checks.map((check, index) => (
              <div
                key={`${check.type}:${index}`}
                className={cn(
                  "flex items-center gap-2 text-xs",
                  check.passed ? "text-emerald-300" : "text-destructive"
                )}
              >
                <span aria-hidden>{check.passed ? "✓" : "×"}</span>
                <span>{check.label}</span>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-muted-foreground">{label}</div>
      <div className="mt-0.5 font-medium">{value}</div>
    </div>
  );
}

function formatDuration(value: number): string {
  return value < 1000
    ? `${Math.round(value)} ms`
    : `${(value / 1000).toFixed(1)} s`;
}
