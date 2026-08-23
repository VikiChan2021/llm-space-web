import {
  getMessageText,
  type AgentTransport,
  type ModelConfig,
  type Thread,
} from "@llm-space/core";
import {
  MAX_EVALUATION_CASES,
  MAX_EVALUATION_EXPERIMENTS,
  aggregateEvaluationExperiment,
  createEvaluationExperiment,
  evaluationBudget,
  findEvaluationForPair,
  preferredEvaluationRubricId,
  upsertEvaluation,
  upsertEvaluationRubric,
  validateEvaluationSource,
  type EvaluationCase,
  type EvaluationExperiment,
  type EvaluationExperimentRun,
  type EvaluationRubricInput,
  type EvaluationVariantId,
} from "@llm-space/core/thread";
import { ConfirmDialog } from "@llm-space/ui/components/confirm-dialog";
import {
  RunEvaluationDialog,
  RunTraceView,
} from "@llm-space/ui/components/thread-playground";
import { cn } from "@llm-space/ui/lib/utils";
import { Button } from "@llm-space/ui/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@llm-space/ui/ui/dialog";
import { Input } from "@llm-space/ui/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@llm-space/ui/ui/select";
import { Textarea } from "@llm-space/ui/ui/textarea";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CheckCircle2Icon,
  DownloadIcon,
  EyeIcon,
  FileUpIcon,
  FlaskConicalIcon,
  LoaderCircleIcon,
  PlusIcon,
  RotateCcwIcon,
  SquareIcon,
  Trash2Icon,
  TriangleAlertIcon,
  XCircleIcon,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import { toast } from "sonner";

import { GUEST_FALLBACK_PROVIDER, type GuestQuota } from "./guest-api";
import {
  captureGuestEvaluationEvent,
} from "./guest-evaluation-analytics";
import {
  addGuestEvaluationExperiment,
  deleteGuestEvaluationExperiment,
  loadGuestEvaluationLab,
  parseGuestEvaluationLabImport,
  saveGuestEvaluationLab,
  selectGuestEvaluationExperiment,
  serializeGuestEvaluationLab,
  updateGuestEvaluationExperiment,
} from "./guest-evaluation-lab";
import { runGuestEvaluationItem } from "./guest-evaluation-runner";

const STORAGE = _browserStorage();

export function GuestEvaluationLabDialog({
  open,
  onOpenChange,
  createRequest,
  thread,
  fallbackModel,
  quota,
  transport,
  runtimeId,
  onQuotaRefresh,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  createRequest: number;
  thread: Thread;
  fallbackModel: ModelConfig | null;
  quota: GuestQuota | null;
  transport: AgentTransport;
  runtimeId: string;
  onQuotaRefresh: () => Promise<void>;
}) {
  const loadedRef = useRef(loadGuestEvaluationLab(STORAGE));
  const [repository, setRepository] = useState(
    () => loadedRef.current.repository
  );
  const [storageError, setStorageError] = useState<string | null>(
    () => loadedRef.current.storageError
  );
  const [runningExperimentId, setRunningExperimentId] = useState<string | null>(
    null
  );
  const [traceRun, setTraceRun] = useState<EvaluationExperimentRun | null>(null);
  const [scoringPair, setScoringPair] = useState<{
    baseline: EvaluationExperimentRun;
    candidate: EvaluationExperimentRun;
  } | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const handledCreateRequestRef = useRef(0);
  const draftCreationGuardRef = useRef(false);
  const openedAtRef = useRef<number | null>(null);

  const activeExperiment = useMemo(
    () =>
      repository.experiments.find(
        (item) => item.id === repository.activeExperimentId
      ) ?? repository.experiments.at(-1) ?? null,
    [repository]
  );
  const isRunning = runningExperimentId === activeExperiment?.id;

  const persistRepository = useCallback(
    (
      transform: (
        current: typeof repository
      ) => typeof repository
    ) => {
      setRepository((current) => {
        const next = transform(current);
        setStorageError(saveGuestEvaluationLab(STORAGE, next));
        return next;
      });
    },
    []
  );

  const createDraft = useCallback(() => {
    if (draftCreationGuardRef.current) return;
    draftCreationGuardRef.current = true;
    queueMicrotask(() => {
      draftCreationGuardRef.current = false;
    });
    const model = thread.model ?? fallbackModel;
    if (!model) {
      toast.error("请先选择一个可运行模型。");
      return;
    }
    if (repository.experiments.length >= MAX_EVALUATION_EXPERIMENTS) {
      toast.error("最多保存 10 个实验。", {
        description: "请先导出并删除一个旧实验。",
      });
      return;
    }
    const experiment = createEvaluationExperiment({ thread, model });
    const sourceError = validateEvaluationSource(experiment.sourceThread);
    if (sourceError) {
      toast.error("无法创建评测实验", { description: sourceError });
      return;
    }
    persistRepository(
      (current) => addGuestEvaluationExperiment(current, experiment) ?? current
    );
    captureGuestEvaluationEvent("experiment_created", { experiment });
  }, [fallbackModel, persistRepository, repository.experiments.length, thread]);

  useEffect(() => {
    if (!open) {
      openedAtRef.current = null;
      return;
    }
    if (openedAtRef.current === null) {
      openedAtRef.current = Date.now();
      captureGuestEvaluationEvent("lab_opened", {
        experiment: activeExperiment ?? undefined,
      });
    }
    const requested =
      createRequest > 0 && createRequest !== handledCreateRequestRef.current;
    if (requested) {
      handledCreateRequestRef.current = createRequest;
      createDraft();
    } else if (!activeExperiment) {
      createDraft();
    }
  }, [activeExperiment, createDraft, createRequest, open]);

  const commitExperiment = useCallback(
    (
      transform: (experiment: EvaluationExperiment) => EvaluationExperiment
    ) => {
      if (!activeExperiment) return;
      const next = transform(activeExperiment);
      persistRepository((current) =>
        updateGuestEvaluationExperiment(current, {
          ...next,
          updatedAt: Date.now(),
        })
      );
    },
    [activeExperiment, persistRepository]
  );

  const requestClose = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen && isRunning) {
        setCloseConfirmOpen(true);
        return;
      }
      onOpenChange(nextOpen);
    },
    [isRunning, onOpenChange]
  );

  const runItems = useCallback(
    async (
      experiment: EvaluationExperiment,
      targets: { caseId: string; variantId: EvaluationVariantId }[]
    ) => {
      const controller = new AbortController();
      abortControllerRef.current = controller;
      setRunningExperimentId(experiment.id);
      let working: EvaluationExperiment = {
        ...experiment,
        status: "running",
        runs: experiment.runs.map((run) =>
          targets.some(
            (target) =>
              target.caseId === run.caseId &&
              target.variantId === run.variantId
          )
            ? {
                ...run,
                status: "queued",
                errorCategory: undefined,
                errorMessage: undefined,
              }
            : run
        ),
        updatedAt: Date.now(),
      };
      persistRepository((current) =>
        updateGuestEvaluationExperiment(current, working)
      );
      for (const target of targets) {
        if (controller.signal.aborted) break;
        const evaluationCase = working.cases.find(
          (item) => item.id === target.caseId
        );
        if (!evaluationCase) continue;
        working = replaceRun(working, target, (run) => ({
          ...run,
          status: "running",
          startedAt: Date.now(),
        }));
        persistRepository((current) =>
          updateGuestEvaluationExperiment(current, working)
        );
        const itemStartedAt = Date.now();
        const result = await runGuestEvaluationItem({
          experiment: working,
          evaluationCase,
          variantId: target.variantId,
          transport,
          runtimeId: `${runtimeId}:evaluation:${working.id}`,
          signal: controller.signal,
        }).catch((error: unknown): EvaluationExperimentRun => ({
          id: crypto.randomUUID(),
          caseId: target.caseId,
          variantId: target.variantId,
          status: controller.signal.aborted ? "aborted" : "failed",
          modelTurns: 0,
          durationMs: Date.now() - itemStartedAt,
          toolNames: [],
          checks: [],
          errorCategory: controller.signal.aborted ? "aborted" : "unexpected",
          errorMessage: controller.signal.aborted
            ? "本次运行已停止。"
            : error instanceof Error
              ? error.message
              : "本次运行失败，可单独重试。",
          startedAt: itemStartedAt,
          completedAt: Date.now(),
        }));
        working = replaceRun(working, target, () => result);
        persistRepository((current) =>
          updateGuestEvaluationExperiment(current, working)
        );
        await onQuotaRefresh().catch(() => undefined);
      }
      const normalizedRuns = working.runs.map((run) =>
        run.status === "running" ? { ...run, status: "aborted" as const } : run
      );
      const hasIncomplete = normalizedRuns.some(
        (run) => run.status !== "completed"
      );
      working = {
        ...working,
        status: hasIncomplete ? "partial" : "completed",
        runs: normalizedRuns,
        updatedAt: Date.now(),
      };
      persistRepository((current) =>
        updateGuestEvaluationExperiment(current, working)
      );
      setRunningExperimentId(null);
      abortControllerRef.current = null;
      if (controller.signal.aborted) {
        captureGuestEvaluationEvent("experiment_stopped", {
          experiment: working,
        });
      } else {
        captureGuestEvaluationEvent("experiment_completed", {
          experiment: working,
          elapsedMs:
            openedAtRef.current === null
              ? undefined
              : Date.now() - openedAtRef.current,
        });
      }
    },
    [onQuotaRefresh, persistRepository, runtimeId, transport]
  );

  const startExperiment = useCallback(() => {
    if (!activeExperiment || isRunning) return;
    const validation = validateExperiment(activeExperiment);
    if (validation) {
      toast.error("实验尚未准备好", { description: validation });
      return;
    }
    const budget = evaluationBudget(activeExperiment.cases.length);
    const remaining = quota
      ? Math.min(quota.browserRemaining, quota.ipRemaining)
      : 0;
    if (!quota || remaining < budget) {
      toast.error("剩余额度不足", {
        description: `本实验最坏需要 ${budget} 次 Run，当前剩余 ${remaining} 次。`,
      });
      return;
    }
    const runs = activeExperiment.cases.flatMap((evaluationCase) =>
      (["baseline", "candidate"] as const).map((variantId) => ({
        id: crypto.randomUUID(),
        caseId: evaluationCase.id,
        variantId,
        status: "queued" as const,
        modelTurns: 0,
        durationMs: 0,
        toolNames: [],
        checks: [],
      }))
    );
    const frozen = {
      ...activeExperiment,
      runs,
      evaluations: [],
      status: "running" as const,
      updatedAt: Date.now(),
    };
    captureGuestEvaluationEvent("experiment_started", {
      experiment: frozen,
    });
    void runItems(
      frozen,
      runs.map((run) => ({
        caseId: run.caseId,
        variantId: run.variantId,
      }))
    );
  }, [activeExperiment, isRunning, quota, runItems]);

  const stopExperiment = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  const continueExperiment = useCallback(() => {
    if (!activeExperiment || isRunning) return;
    const targets = activeExperiment.runs
      .filter((run) => run.status === "queued" || run.status === "aborted")
      .map((run) => ({ caseId: run.caseId, variantId: run.variantId }));
    if (targets.length === 0) return;
    void runItems(activeExperiment, targets);
  }, [activeExperiment, isRunning, runItems]);

  const retryResult = useCallback(
    (result: EvaluationExperimentRun) => {
      if (!activeExperiment || isRunning) return;
      void runItems(activeExperiment, [
        { caseId: result.caseId, variantId: result.variantId },
      ]);
    },
    [activeExperiment, isRunning, runItems]
  );

  const deleteExperiment = useCallback(() => {
    if (!activeExperiment) return;
    persistRepository((current) =>
      deleteGuestEvaluationExperiment(current, activeExperiment.id)
    );
    setDeleteConfirmOpen(false);
  }, [activeExperiment, persistRepository]);

  const exportExperiment = useCallback(() => {
    if (!activeExperiment) return;
    const blob = new Blob([serializeGuestEvaluationLab(activeExperiment)], {
      type: "application/json;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${safeFilename(activeExperiment.name)}.evaluation.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    captureGuestEvaluationEvent("experiment_exported", {
      experiment: activeExperiment,
    });
  }, [activeExperiment]);

  const importExperiment = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file) return;
      try {
        const imported = parseGuestEvaluationLabImport(await file.text());
        if (repository.experiments.length >= MAX_EVALUATION_EXPERIMENTS) {
          throw new Error("最多保存 10 个实验，请先导出并删除旧实验。");
        }
        const duplicate = repository.experiments.some(
          (item) => item.id === imported.id
        );
        const next = duplicate
          ? {
              ...imported,
              id: crypto.randomUUID(),
              name: `${imported.name}（导入）`,
              createdAt: Date.now(),
              updatedAt: Date.now(),
            }
          : imported;
        persistRepository(
          (current) => addGuestEvaluationExperiment(current, next) ?? current
        );
        captureGuestEvaluationEvent("experiment_imported", {
          experiment: next,
        });
      } catch (error) {
        toast.error("无法导入评测文件", {
          description: error instanceof Error ? error.message : "请检查文件。",
        });
      }
    },
    [persistRepository, repository.experiments]
  );

  const baselineRun = scoringPair?.baseline.run ?? null;
  const candidateRun = scoringPair?.candidate.run ?? null;
  const selectedEvaluation =
    activeExperiment && baselineRun && candidateRun
      ? findEvaluationForPair(
          activeExperiment.evaluations,
          baselineRun.id,
          candidateRun.id
        )
      : null;
  const preferredRubric = activeExperiment
    ? preferredEvaluationRubricId(
        activeExperiment.evaluations,
        activeExperiment.rubrics
      )
    : null;

  return (
    <>
      <Dialog open={open} onOpenChange={requestClose}>
        <DialogContent
          data-coach-surface="evaluation"
          className="flex h-[100dvh] w-screen max-w-none flex-col gap-0 rounded-none p-0 sm:h-[90vh] sm:w-[90vw] sm:max-w-[90vw] sm:rounded-xl"
          showCloseButton={!isRunning}
          onEscapeKeyDown={(event) => {
            if (isRunning) {
              event.preventDefault();
              setCloseConfirmOpen(true);
            }
          }}
        >
          <DialogHeader className="shrink-0 border-b px-4 py-3 pr-12">
            <div className="flex flex-wrap items-center gap-2">
              <FlaskConicalIcon className="size-4" />
              <DialogTitle>评测实验室</DialogTitle>
              <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[0.625rem] font-semibold text-primary">
                Local V1
              </span>
            </div>
            <DialogDescription>
              用固定 Case 对比 Baseline 与 Candidate；实验不会修改当前 Thread 或普通 Run history。
            </DialogDescription>
          </DialogHeader>

          <div className="flex min-h-0 flex-1 flex-col md:flex-row">
            <aside className="flex shrink-0 gap-2 overflow-x-auto border-b p-3 md:w-64 md:flex-col md:overflow-y-auto md:border-r md:border-b-0">
              <Select
                value={activeExperiment?.id}
                onValueChange={(id) =>
                  persistRepository((current) =>
                    selectGuestEvaluationExperiment(current, id)
                  )
                }
                disabled={isRunning || repository.experiments.length === 0}
              >
                <SelectTrigger className="min-w-48 flex-1 md:w-full">
                  <SelectValue placeholder="选择实验" />
                </SelectTrigger>
                <SelectContent>
                  {repository.experiments.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" onClick={createDraft} disabled={isRunning}>
                <PlusIcon /> 新建实验
              </Button>
              <Button
                variant="outline"
                onClick={() => importInputRef.current?.click()}
                disabled={isRunning}
              >
                <FileUpIcon /> 导入 JSON
              </Button>
              <input
                ref={importInputRef}
                className="hidden"
                type="file"
                accept="application/json,.json"
                onChange={importExperiment}
              />
              <Button
                variant="outline"
                onClick={exportExperiment}
                disabled={!activeExperiment}
              >
                <DownloadIcon /> 导出实验
              </Button>
              <Button
                variant="ghost"
                className="text-destructive hover:text-destructive"
                onClick={() => setDeleteConfirmOpen(true)}
                disabled={!activeExperiment || isRunning}
              >
                <Trash2Icon /> 删除实验
              </Button>
              <div className="mt-auto hidden text-[0.625rem] text-muted-foreground md:block">
                已保存 {repository.experiments.length}/{MAX_EVALUATION_EXPERIMENTS}
              </div>
            </aside>

            <main className="min-h-0 min-w-0 flex-1 overflow-y-auto p-3 sm:p-5">
              {storageError ? (
                <div role="alert" className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-destructive">
                  {storageError}
                </div>
              ) : null}
              {activeExperiment ? (
                <ExperimentEditor
                  experiment={activeExperiment}
                  quota={quota}
                  isRunning={isRunning}
                  onChange={commitExperiment}
                  onStart={startExperiment}
                  onStop={stopExperiment}
                  onContinue={continueExperiment}
                  onRetry={retryResult}
                  onTrace={(run) => {
                    setTraceRun(run);
                    captureGuestEvaluationEvent("trace_opened", {
                      experiment: activeExperiment,
                      result: run,
                    });
                  }}
                  onScore={(pair) => setScoringPair(pair)}
                />
              ) : (
                <div className="flex min-h-72 flex-col items-center justify-center gap-3 text-center">
                  <FlaskConicalIcon className="size-10 text-muted-foreground" />
                  <div className="font-medium">还没有评测实验</div>
                  <p className="max-w-sm text-muted-foreground">
                    从当前 Thread 创建 Baseline 与 Candidate，然后用最多 3 个 Case 验证改动。
                  </p>
                  <Button onClick={createDraft}>创建第一个实验</Button>
                </div>
              )}
            </main>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={traceRun !== null} onOpenChange={(next) => !next && setTraceRun(null)}>
        <DialogContent className="flex h-[85vh] max-w-[min(900px,calc(100%-2rem))] flex-col p-0">
          <DialogHeader className="border-b px-4 py-3 pr-12">
            <DialogTitle>实验 Trace</DialogTitle>
            <DialogDescription>
              {traceRun?.variantId === "baseline" ? "Baseline" : "Candidate"} · {traceRun?.modelTurns ?? 0} 个模型回合
            </DialogDescription>
          </DialogHeader>
          {traceRun?.run ? (
            <RunTraceView className="min-h-0 flex-1" run={traceRun.run} />
          ) : null}
        </DialogContent>
      </Dialog>

      <RunEvaluationDialog
        open={scoringPair !== null}
        leftRun={baselineRun}
        rightRun={candidateRun}
        evaluation={selectedEvaluation}
        rubrics={activeExperiment?.rubrics ?? []}
        preferredRubricId={preferredRubric}
        onOpenChange={(next) => !next && setScoringPair(null)}
        onSave={(input) => {
          if (!activeExperiment || !baselineRun || !candidateRun) return false;
          const evaluations = upsertEvaluation(
            activeExperiment.evaluations,
            activeExperiment.runs
              .map((run) => run.run)
              .filter((run): run is NonNullable<typeof run> => Boolean(run)),
            input,
            Date.now()
          );
          if (!evaluations) return false;
          commitExperiment((experiment) => ({ ...experiment, evaluations }));
          return true;
        }}
        onSaveRubric={(input: EvaluationRubricInput) => {
          if (!activeExperiment) return null;
          const result = upsertEvaluationRubric(
            activeExperiment.rubrics,
            input,
            Date.now()
          );
          if (!result) return null;
          commitExperiment((experiment) => ({
            ...experiment,
            rubrics: result.rubrics,
          }));
          return result.rubric;
        }}
        onRemoveRubric={(id) => {
          if (!activeExperiment) return false;
          const rubrics = activeExperiment.rubrics.filter(
            (rubric) => rubric.id !== id
          );
          if (rubrics.length === activeExperiment.rubrics.length) return false;
          commitExperiment((experiment) => ({ ...experiment, rubrics }));
          return true;
        }}
      />

      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title="删除这个评测实验？"
        description="实验配置、结果、Trace 和人工评分都会从当前浏览器删除。请先导出需要保留的证据。"
        confirmLabel="删除实验"
        onConfirm={deleteExperiment}
      />
      <ConfirmDialog
        open={closeConfirmOpen}
        onOpenChange={setCloseConfirmOpen}
        title="停止并关闭实验？"
        description="当前请求会中止，已完成结果会保留；重新打开后可以继续未完成项。"
        confirmLabel="停止并关闭"
        onConfirm={() => {
          stopExperiment();
          setCloseConfirmOpen(false);
          onOpenChange(false);
        }}
      />
    </>
  );
}

export default GuestEvaluationLabDialog;

function ExperimentEditor({
  experiment,
  quota,
  isRunning,
  onChange,
  onStart,
  onStop,
  onContinue,
  onRetry,
  onTrace,
  onScore,
}: {
  experiment: EvaluationExperiment;
  quota: GuestQuota | null;
  isRunning: boolean;
  onChange: (transform: (value: EvaluationExperiment) => EvaluationExperiment) => void;
  onStart: () => void;
  onStop: () => void;
  onContinue: () => void;
  onRetry: (run: EvaluationExperimentRun) => void;
  onTrace: (run: EvaluationExperimentRun) => void;
  onScore: (pair: {
    baseline: EvaluationExperimentRun;
    candidate: EvaluationExperimentRun;
  }) => void;
}) {
  const frozen = experiment.runs.length > 0;
  const budget = evaluationBudget(experiment.cases.length);
  const remaining = quota
    ? Math.min(quota.browserRemaining, quota.ipRemaining)
    : 0;
  const insufficientQuota = !quota || remaining < budget;
  const aggregates = aggregateEvaluationExperiment(experiment);
  const progress = experiment.runs.filter(
    (run) => run.status !== "queued" && run.status !== "running"
  ).length;
  const canContinue = experiment.runs.some(
    (run) => run.status === "queued" || run.status === "aborted"
  );
  const tools = experiment.sourceThread.context?.tools ?? [];
  const toolNames = evaluationToolNames(tools);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
      <section className="rounded-xl border bg-card/40 p-4">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-medium">实验设置</h3>
            <p className="text-muted-foreground">
              首次运行后配置冻结；如需修改，请新建实验。
            </p>
          </div>
          <StatusPill status={experiment.status} />
        </div>
        <label className="grid gap-1.5">
          <span className="font-medium">实验名称</span>
          <Input
            autoFocus
            value={experiment.name}
            disabled={frozen || isRunning}
            onChange={(event) =>
              onChange((value) => ({ ...value, name: event.target.value }))
            }
          />
        </label>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <VariantCard
            title="Baseline"
            description="打开实验时冻结的当前 Thread 配置"
            model={experiment.sourceThread.model!}
            systemPrompt={experiment.sourceThread.context?.systemPrompt ?? ""}
            readonly
          />
          <VariantCard
            title="Candidate"
            description="只允许修改模型、参数和 System Prompt"
            model={experiment.candidate.model}
            systemPrompt={experiment.candidate.systemPrompt}
            readonly={frozen || isRunning}
            onModelChange={(model) =>
              onChange((value) => ({
                ...value,
                candidate: { ...value.candidate, model },
              }))
            }
            onSystemPromptChange={(systemPrompt) =>
              onChange((value) => ({
                ...value,
                candidate: { ...value.candidate, systemPrompt },
              }))
            }
          />
        </div>
        <div className="mt-3 rounded-lg border bg-muted/20 p-3 text-muted-foreground">
          Tools、Variables、消息前缀和安全策略在两侧保持一致。自动工具：
          {toolNames.length > 0 ? toolNames.join("、") : "无"}。
        </div>
      </section>

      <section className="rounded-xl border bg-card/40 p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h3 className="font-medium">测试 Case</h3>
            <p className="text-muted-foreground">1-3 条纯文本输入，规则均为可选。</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={frozen || isRunning || experiment.cases.length >= MAX_EVALUATION_CASES}
            onClick={() =>
              onChange((value) => ({
                ...value,
                cases: [
                  ...value.cases,
                  {
                    id: crypto.randomUUID(),
                    name: `Case ${value.cases.length + 1}`,
                    input: "",
                    expectations: {},
                  },
                ],
              }))
            }
          >
            <PlusIcon /> 添加 Case
          </Button>
        </div>
        <div className="grid gap-3">
          {experiment.cases.map((evaluationCase, index) => (
            <CaseEditor
              key={evaluationCase.id}
              evaluationCase={evaluationCase}
              index={index}
              count={experiment.cases.length}
              toolNames={toolNames}
              readonly={frozen || isRunning}
              onUpdate={(next) =>
                onChange((value) => ({
                  ...value,
                  cases: value.cases.map((item) =>
                    item.id === next.id ? next : item
                  ),
                }))
              }
              onMove={(direction) =>
                onChange((value) => ({
                  ...value,
                  cases: moveCase(value.cases, index, index + direction),
                }))
              }
              onRemove={() =>
                onChange((value) => ({
                  ...value,
                  cases: value.cases.filter(
                    (item) => item.id !== evaluationCase.id
                  ),
                }))
              }
            />
          ))}
        </div>
      </section>

      <section className="rounded-xl border bg-card/40 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-medium">额度与执行</h3>
            <p className="text-muted-foreground">
              {experiment.cases.length} Case × 2 变体 × 最多 3 回合 = 最坏 {budget} 次 Run；当前剩余 {remaining} 次。
            </p>
            {insufficientQuota && !frozen ? (
              <p className="mt-1 text-destructive">
                剩余额度不足，暂时不能开始。额度恢复时间：{quota?.resetsAt ? new Date(quota.resetsAt).toLocaleString() : "未知"}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            {isRunning ? (
              <Button variant="destructive" onClick={onStop}>
                <SquareIcon /> 停止实验
              </Button>
            ) : frozen ? (
              <Button onClick={onContinue} disabled={!canContinue}>
                <RotateCcwIcon /> 继续未完成项
              </Button>
            ) : (
              <Button onClick={onStart} disabled={insufficientQuota}>
                <FlaskConicalIcon /> 检查额度并开始
              </Button>
            )}
          </div>
        </div>
        {experiment.runs.length > 0 ? (
          <div className="mt-3">
            <div className="mb-1 flex justify-between text-[0.625rem] text-muted-foreground">
              <span>进度</span><span>{progress}/{experiment.runs.length}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-primary transition-[width]"
                style={{ width: `${experiment.runs.length ? (progress / experiment.runs.length) * 100 : 0}%` }}
              />
            </div>
          </div>
        ) : null}
      </section>

      {experiment.runs.length > 0 ? (
        <section className="rounded-xl border bg-card/40 p-4">
          <h3 className="font-medium">聚合结果</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {aggregates.map((aggregate) => (
              <div key={aggregate.variantId} className="rounded-lg border p-3">
                <div className="font-medium capitalize">{aggregate.variantId}</div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-muted-foreground">
                  <span>完成</span><span className="text-right text-foreground">{aggregate.completed}/{aggregate.total}</span>
                  <span>规则通过</span><span className="text-right text-foreground">{aggregate.checksPassed}/{aggregate.checksTotal}</span>
                  <span>平均 Token</span><span className="text-right text-foreground">{formatNumber(aggregate.averageTokens)}</span>
                  <span>平均回合</span><span className="text-right text-foreground">{formatNumber(aggregate.averageModelTurns)}</span>
                  <span>平均耗时</span><span className="text-right text-foreground">{formatDuration(aggregate.averageDurationMs)}</span>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 grid gap-3">
            {experiment.cases.map((evaluationCase) => {
              const baseline = findResult(experiment, evaluationCase.id, "baseline");
              const candidate = findResult(experiment, evaluationCase.id, "candidate");
              return (
                <ResultRow
                  key={evaluationCase.id}
                  evaluationCase={evaluationCase}
                  baseline={baseline}
                  candidate={candidate}
                  running={isRunning}
                  onRetry={onRetry}
                  onTrace={onTrace}
                  onScore={
                    baseline?.run && candidate?.run
                      ? () => onScore({ baseline, candidate })
                      : undefined
                  }
                />
              );
            })}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function VariantCard({
  title,
  description,
  model,
  systemPrompt,
  readonly,
  onModelChange,
  onSystemPromptChange,
}: {
  title: string;
  description: string;
  model: ModelConfig;
  systemPrompt: string;
  readonly: boolean;
  onModelChange?: (model: ModelConfig) => void;
  onSystemPromptChange?: (value: string) => void;
}) {
  return (
    <div className="rounded-lg border p-3">
      <div className="font-medium">{title}</div>
      <p className="mb-3 text-muted-foreground">{description}</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="grid gap-1">
          <span>模型</span>
          <Select
            value={model.id}
            disabled={readonly}
            onValueChange={(id) => onModelChange?.({ ...model, provider: "bigmodel", id })}
          >
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {GUEST_FALLBACK_PROVIDER.models.map((item) => (
                <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <label className="grid gap-1">
          <span>Temperature</span>
          <Input
            type="number"
            min={0}
            max={2}
            step={0.1}
            disabled={readonly}
            value={model.params?.temperature ?? 0.7}
            onChange={(event) =>
              onModelChange?.({
                ...model,
                params: {
                  ...model.params,
                  temperature: Number(event.target.value),
                },
              })
            }
          />
        </label>
        <label className="grid gap-1">
          <span>Max Tokens</span>
          <Input
            type="number"
            min={1}
            max={32_768}
            step={128}
            disabled={readonly}
            value={model.params?.maxTokens ?? 2_048}
            onChange={(event) =>
              onModelChange?.({
                ...model,
                params: {
                  ...model.params,
                  maxTokens: Number(event.target.value),
                },
              })
            }
          />
        </label>
      </div>
      <label className="mt-3 grid gap-1">
        <span>System Prompt</span>
        <Textarea
          className="min-h-28"
          disabled={readonly}
          value={systemPrompt}
          onChange={(event) => onSystemPromptChange?.(event.target.value)}
        />
      </label>
    </div>
  );
}

function CaseEditor({
  evaluationCase,
  index,
  count,
  toolNames,
  readonly,
  onUpdate,
  onMove,
  onRemove,
}: {
  evaluationCase: EvaluationCase;
  index: number;
  count: number;
  toolNames: string[];
  readonly: boolean;
  onUpdate: (value: EvaluationCase) => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
}) {
  const updateExpectation = (
    key: keyof EvaluationCase["expectations"],
    value: string
  ) =>
    onUpdate({
      ...evaluationCase,
      expectations: { ...evaluationCase.expectations, [key]: value || undefined },
    });
  return (
    <div className="rounded-lg border p-3">
      <div className="mb-2 flex items-center gap-2">
        <Input
          value={evaluationCase.name}
          disabled={readonly}
          aria-label={`Case ${index + 1} 名称`}
          onChange={(event) => onUpdate({ ...evaluationCase, name: event.target.value })}
        />
        <Button variant="ghost" size="icon-sm" aria-label={`上移 ${evaluationCase.name}`} disabled={readonly || index === 0} onClick={() => onMove(-1)}><ArrowUpIcon /></Button>
        <Button variant="ghost" size="icon-sm" aria-label={`下移 ${evaluationCase.name}`} disabled={readonly || index === count - 1} onClick={() => onMove(1)}><ArrowDownIcon /></Button>
        <Button variant="ghost" size="icon-sm" aria-label={`删除 ${evaluationCase.name}`} disabled={readonly || count === 1} onClick={onRemove}><Trash2Icon /></Button>
      </div>
      <label className="grid gap-1">
        <span>用户输入</span>
        <Textarea className="min-h-20" disabled={readonly} value={evaluationCase.input} onChange={(event) => onUpdate({ ...evaluationCase, input: event.target.value })} />
      </label>
      <div className="mt-3 grid gap-3 md:grid-cols-3">
        <label className="grid gap-1"><span>必须包含</span><Input disabled={readonly} value={evaluationCase.expectations.requiredText ?? ""} onChange={(event) => updateExpectation("requiredText", event.target.value)} /></label>
        <label className="grid gap-1"><span>不得包含</span><Input disabled={readonly} value={evaluationCase.expectations.forbiddenText ?? ""} onChange={(event) => updateExpectation("forbiddenText", event.target.value)} /></label>
        <label className="grid gap-1">
          <span>预期 Tool</span>
          <Select value={evaluationCase.expectations.expectedToolName ?? "none"} disabled={readonly} onValueChange={(value) => updateExpectation("expectedToolName", value === "none" ? "" : value)}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="none">不检查</SelectItem>{toolNames.map((name) => <SelectItem key={name} value={name}>{name}</SelectItem>)}</SelectContent>
          </Select>
        </label>
      </div>
    </div>
  );
}

function ResultRow({
  evaluationCase,
  baseline,
  candidate,
  running,
  onRetry,
  onTrace,
  onScore,
}: {
  evaluationCase: EvaluationCase;
  baseline?: EvaluationExperimentRun;
  candidate?: EvaluationExperimentRun;
  running: boolean;
  onRetry: (run: EvaluationExperimentRun) => void;
  onTrace: (run: EvaluationExperimentRun) => void;
  onScore?: () => void;
}) {
  return (
    <div className="rounded-lg border p-3">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="font-medium">{evaluationCase.name}</div>
        {onScore ? <Button variant="outline" size="sm" onClick={onScore}>人工评分</Button> : null}
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <ResultCell label="Baseline" result={baseline} running={running} onRetry={onRetry} onTrace={onTrace} />
        <ResultCell label="Candidate" result={candidate} running={running} onRetry={onRetry} onTrace={onTrace} />
      </div>
    </div>
  );
}

function ResultCell({
  label,
  result,
  running,
  onRetry,
  onTrace,
}: {
  label: string;
  result?: EvaluationExperimentRun;
  running: boolean;
  onRetry: (run: EvaluationExperimentRun) => void;
  onTrace: (run: EvaluationExperimentRun) => void;
}) {
  const output = result?.run ? lastAssistantText(result.run) : "";
  return (
    <div className="min-w-0 rounded-md bg-muted/20 p-3">
      <div className="flex items-center justify-between gap-2"><span className="font-medium">{label}</span><RunStatus status={result?.status ?? "queued"} /></div>
      {output ? <p className="mt-2 max-h-32 overflow-y-auto whitespace-pre-wrap text-foreground/90">{output}</p> : null}
      {result?.errorMessage ? <p className="mt-2 text-amber-300">{result.errorMessage}</p> : null}
      {result ? (
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[0.625rem] text-muted-foreground">
          <span>{result.modelTurns} 回合</span><span>{formatDuration(result.durationMs)}</span><span>{result.toolNames.length} Tool</span>
        </div>
      ) : null}
      {result?.checks.length ? <div className="mt-2 flex flex-wrap gap-1">{result.checks.map((check) => <span key={`${check.type}:${check.label}`} className={cn("rounded px-1.5 py-0.5 text-[0.625rem]", check.passed ? "bg-emerald-500/15 text-emerald-300" : "bg-destructive/15 text-destructive")}>{check.passed ? "✓" : "×"} {check.label}</span>)}</div> : null}
      {result ? <div className="mt-3 flex gap-2">{result.run ? <Button variant="ghost" size="sm" onClick={() => onTrace(result)}><EyeIcon /> Trace</Button> : null}{["failed", "aborted"].includes(result.status) ? <Button variant="ghost" size="sm" disabled={running} onClick={() => onRetry(result)}><RotateCcwIcon /> 重试</Button> : null}</div> : null}
    </div>
  );
}

function StatusPill({ status }: { status: EvaluationExperiment["status"] }) {
  const labels = { draft: "草稿", running: "运行中", partial: "部分完成", completed: "已完成" };
  return <span className="rounded-full border px-2 py-1 text-[0.625rem] text-muted-foreground">{labels[status]}</span>;
}

function RunStatus({ status }: { status: EvaluationExperimentRun["status"] }) {
  const labels = { queued: "等待", running: "运行中", completed: "完成", failed: "失败", aborted: "已停止", needs_review: "需人工确认" };
  const Icon = status === "completed" ? CheckCircle2Icon : status === "running" ? LoaderCircleIcon : status === "failed" ? XCircleIcon : status === "needs_review" ? TriangleAlertIcon : SquareIcon;
  return <span className={cn("flex items-center gap-1 text-[0.625rem]", status === "completed" && "text-emerald-300", ["failed", "needs_review"].includes(status) && "text-amber-300")}><Icon className={cn("size-3", status === "running" && "animate-spin")} />{labels[status]}</span>;
}

function replaceRun(
  experiment: EvaluationExperiment,
  target: { caseId: string; variantId: EvaluationVariantId },
  transform: (run: EvaluationExperimentRun) => EvaluationExperimentRun
): EvaluationExperiment {
  return {
    ...experiment,
    runs: experiment.runs.map((run) =>
      run.caseId === target.caseId && run.variantId === target.variantId
        ? transform(run)
        : run
    ),
    updatedAt: Date.now(),
  };
}

function findResult(experiment: EvaluationExperiment, caseId: string, variantId: EvaluationVariantId) {
  return experiment.runs.find((run) => run.caseId === caseId && run.variantId === variantId);
}

function moveCase(cases: EvaluationCase[], from: number, to: number): EvaluationCase[] {
  if (to < 0 || to >= cases.length || from === to) return cases;
  const next = [...cases];
  const [item] = next.splice(from, 1);
  if (!item) return cases;
  next.splice(to, 0, item);
  return next;
}

function validateExperiment(experiment: EvaluationExperiment): string | null {
  if (!experiment.name.trim()) return "请输入实验名称。";
  const sourceError = validateEvaluationSource(experiment.sourceThread);
  if (sourceError) return sourceError;
  if (experiment.cases.length < 1 || experiment.cases.length > MAX_EVALUATION_CASES) return "实验需要 1-3 个 Case。";
  if (experiment.cases.some((item) => !item.name.trim() || !item.input.trim())) return "每个 Case 都需要名称和用户输入。";
  const temperature = experiment.candidate.model.params?.temperature;
  if (temperature !== undefined && (temperature < 0 || temperature > 2)) return "Temperature 必须在 0-2 之间。";
  return null;
}

function lastAssistantText(run: NonNullable<EvaluationExperimentRun["run"]>): string {
  const message = [...(run.thread.context?.messages ?? [])].reverse().find((item) => item.role === "assistant");
  return message ? getMessageText(message) : "";
}

function safeFilename(value: string): string {
  const printable = [...value.trim()]
    .filter((character) => character.charCodeAt(0) >= 32)
    .join("");
  return printable.replace(/[<>:"/\\|?*]/g, "-").slice(0, 80) || "evaluation";
}

function evaluationToolNames(
  tools: NonNullable<EvaluationExperiment["sourceThread"]["context"]>["tools"]
): string[] {
  return (tools ?? []).flatMap((tool) =>
    "name" in tool && typeof tool.name === "string" ? [tool.name] : []
  );
}

function formatNumber(value: number | null): string {
  return value === null ? "—" : new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 1 }).format(value);
}

function formatDuration(value: number | null): string {
  if (value === null) return "—";
  return value < 1000 ? `${Math.round(value)} ms` : `${(value / 1000).toFixed(1)} s`;
}

function _browserStorage(): Storage {
  if (typeof window === "undefined") {
    return { getItem: () => null, setItem: () => undefined } as unknown as Storage;
  }
  return window.localStorage;
}
