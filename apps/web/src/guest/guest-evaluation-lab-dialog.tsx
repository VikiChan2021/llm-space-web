import {
  getMessageText,
  type AgentTransport,
  type ModelConfig,
  type Thread,
} from "@llm-space/core";
import {
  DEFAULT_EVALUATION_BATCH_CASES,
  MAX_EVALUATION_CASES,
  MAX_EVALUATION_EXPERIMENTS,
  MAX_EVALUATION_MODEL_TURNS,
  aggregateEvaluationExperiment,
  classifyEvaluationRegressions,
  createEvaluationExperiment,
  createNextEvaluationExperiment,
  evaluationBudget,
  evaluationRerunTargets,
  findEvaluationForPair,
  planEvaluationPromotion,
  preferredEvaluationRubricId,
  selectedEvaluationCases,
  upsertEvaluation,
  upsertEvaluationRubric,
  validateEvaluationSource,
  type EvaluationCase,
  type EvaluationExperiment,
  type EvaluationExperimentRun,
  type EvaluationPromotionPlan,
  type EvaluationRegressionResult,
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
  GitCompareArrowsIcon,
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
import { captureGuestEvaluationEvent } from "./guest-evaluation-analytics";
import {
  addGuestEvaluationExperiment,
  deleteGuestEvaluationExperiment,
  loadGuestEvaluationLab,
  parseGuestEvaluationCaseSetImport,
  parseGuestEvaluationLabImport,
  saveGuestEvaluationLab,
  selectGuestEvaluationExperiment,
  serializeGuestEvaluationCaseSet,
  serializeGuestEvaluationLab,
  serializeGuestEvaluationReport,
  serializeGuestEvaluationReportHtml,
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
  onApplyCandidate,
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
  onApplyCandidate: (
    experiment: EvaluationExperiment
  ) => { ok: true; thread: Thread } | { ok: false; error: string };
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
  const [traceRun, setTraceRun] = useState<EvaluationExperimentRun | null>(
    null
  );
  const [scoringPair, setScoringPair] = useState<{
    baseline: EvaluationExperimentRun;
    candidate: EvaluationExperimentRun;
  } | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);
  const [promotionPlan, setPromotionPlan] =
    useState<EvaluationPromotionPlan | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const caseSetInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const handledCreateRequestRef = useRef(0);
  const draftCreationGuardRef = useRef(false);
  const openedAtRef = useRef<number | null>(null);

  const activeExperiment = useMemo(
    () =>
      repository.experiments.find(
        (item) => item.id === repository.activeExperimentId
      ) ??
      repository.experiments.at(-1) ??
      null,
    [repository]
  );
  const isRunning = runningExperimentId === activeExperiment?.id;
  const activeExperimentIsImmutable = Boolean(
    activeExperiment &&
    repository.experiments.some(
      (item) => item.lineage?.parentExperimentId === activeExperiment.id
    )
  );

  const persistRepository = useCallback(
    (transform: (current: typeof repository) => typeof repository) => {
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
    (transform: (experiment: EvaluationExperiment) => EvaluationExperiment) => {
      if (!activeExperiment) return;
      if (activeExperimentIsImmutable) return;
      const next = transform(activeExperiment);
      persistRepository((current) =>
        updateGuestEvaluationExperiment(current, {
          ...next,
          updatedAt: Date.now(),
        })
      );
    },
    [activeExperiment, activeExperimentIsImmutable, persistRepository]
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
      const remaining = quota
        ? Math.min(quota.browserRemaining, quota.ipRemaining)
        : 0;
      const budget = targets.length * MAX_EVALUATION_MODEL_TURNS;
      if (!quota || targets.length === 0 || remaining < budget) {
        toast.error("剩余额度不足", {
          description: `本批次最坏需要 ${budget} 次 Run，当前剩余 ${remaining} 次。`,
        });
        return;
      }
      const controller = new AbortController();
      abortControllerRef.current = controller;
      setRunningExperimentId(experiment.id);
      const withRuns = ensureRuns(experiment, targets);
      let working: EvaluationExperiment = {
        ...withRuns,
        status: "running",
        runs: withRuns.runs.map((run) =>
          targets.some(
            (target) =>
              target.caseId === run.caseId && target.variantId === run.variantId
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
      const hasIncomplete = working.cases.some((evaluationCase) =>
        (["baseline", "candidate"] as const).some(
          (variantId) =>
            !normalizedRuns.some(
              (run) =>
                run.caseId === evaluationCase.id &&
                run.variantId === variantId &&
                run.status === "completed"
            )
        )
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
    [onQuotaRefresh, persistRepository, quota, runtimeId, transport]
  );

  const startExperiment = useCallback(() => {
    if (!activeExperiment || isRunning || activeExperimentIsImmutable) return;
    const validation = validateExperiment(activeExperiment);
    if (validation) {
      toast.error("实验尚未准备好", { description: validation });
      return;
    }
    const cases = selectedEvaluationCases(activeExperiment);
    const budget = evaluationBudget(cases.length);
    const remaining = quota
      ? Math.min(quota.browserRemaining, quota.ipRemaining)
      : 0;
    if (!quota || remaining < budget) {
      toast.error("剩余额度不足", {
        description: `本实验最坏需要 ${budget} 次 Run，当前剩余 ${remaining} 次。`,
      });
      return;
    }
    const runs = cases.flatMap((evaluationCase) =>
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
  }, [
    activeExperiment,
    activeExperimentIsImmutable,
    isRunning,
    quota,
    runItems,
  ]);

  const runSelectedCases = useCallback(() => {
    if (!activeExperiment || isRunning || activeExperimentIsImmutable) return;
    const targets = selectedEvaluationCases(activeExperiment).flatMap(
      (evaluationCase) =>
        (["baseline", "candidate"] as const).map((variantId) => ({
          caseId: evaluationCase.id,
          variantId,
        }))
    );
    void runItems(activeExperiment, targets);
  }, [activeExperiment, activeExperimentIsImmutable, isRunning, runItems]);

  const rerunFailedOrRegressed = useCallback(() => {
    if (!activeExperiment || isRunning || activeExperimentIsImmutable) return;
    captureGuestEvaluationEvent("regression_rerun_started", {
      experiment: activeExperiment,
    });
    void runItems(activeExperiment, evaluationRerunTargets(activeExperiment));
  }, [activeExperiment, activeExperimentIsImmutable, isRunning, runItems]);

  const stopExperiment = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  const continueExperiment = useCallback(() => {
    if (!activeExperiment || isRunning || activeExperimentIsImmutable) return;
    const targets = activeExperiment.runs
      .filter((run) => run.status === "queued" || run.status === "aborted")
      .map((run) => ({ caseId: run.caseId, variantId: run.variantId }));
    if (targets.length === 0) return;
    void runItems(activeExperiment, targets);
  }, [activeExperiment, activeExperimentIsImmutable, isRunning, runItems]);

  const retryResult = useCallback(
    (result: EvaluationExperimentRun) => {
      if (!activeExperiment || isRunning || activeExperimentIsImmutable) return;
      void runItems(activeExperiment, [
        { caseId: result.caseId, variantId: result.variantId },
      ]);
    },
    [activeExperiment, activeExperimentIsImmutable, isRunning, runItems]
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

  const importCaseSet = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file || !activeExperiment) return;
      if (activeExperiment.runs.length > 0) {
        toast.error("已运行实验不能替换 Case Set。", {
          description: "请新建实验后再导入。",
        });
        return;
      }
      try {
        const caseSet = parseGuestEvaluationCaseSetImport(await file.text());
        commitExperiment((experiment) => ({
          ...experiment,
          cases: caseSet.cases,
          selectedCaseIds: caseSet.cases
            .slice(0, DEFAULT_EVALUATION_BATCH_CASES)
            .map((evaluationCase) => evaluationCase.id),
          runs: [],
          evaluations: [],
          status: "draft",
        }));
        captureGuestEvaluationEvent("case_set_imported", {
          experiment: { ...activeExperiment, cases: caseSet.cases },
        });
        toast.success(`已导入 ${caseSet.cases.length} 个 Case。`);
      } catch (error) {
        toast.error("无法导入 Case Set", {
          description: error instanceof Error ? error.message : "请检查文件。",
        });
      }
    },
    [activeExperiment, commitExperiment]
  );

  const exportCaseSet = useCallback(() => {
    if (!activeExperiment) return;
    downloadText(
      `${safeFilename(activeExperiment.name)}.cases.json`,
      serializeGuestEvaluationCaseSet(
        activeExperiment.name,
        activeExperiment.cases
      ),
      "application/json;charset=utf-8"
    );
    captureGuestEvaluationEvent("case_set_exported", {
      experiment: activeExperiment,
    });
  }, [activeExperiment]);

  const exportReport = useCallback(
    (format: "json" | "html") => {
      if (!activeExperiment) return;
      const base = `${safeFilename(activeExperiment.name)}.quality-gate`;
      downloadText(
        `${base}.${format}`,
        format === "json"
          ? serializeGuestEvaluationReport(activeExperiment)
          : serializeGuestEvaluationReportHtml(activeExperiment),
        format === "json"
          ? "application/json;charset=utf-8"
          : "text/html;charset=utf-8"
      );
      captureGuestEvaluationEvent("report_exported", {
        experiment: activeExperiment,
      });
    },
    [activeExperiment]
  );

  const requestPromotion = useCallback(() => {
    if (!activeExperiment || isRunning || activeExperimentIsImmutable) return;
    if (activeExperiment.status !== "completed") {
      toast.error("请先完成全部 Case 的两侧运行。", {
        description: "部分完成或未知结果不能直接晋升为下一轮基线。",
      });
      return;
    }
    const unresolvedRegressions = classifyEvaluationRegressions(
      activeExperiment
    ).filter(
      (regression) =>
        regression.status === "regressed" || regression.status === "unknown"
    );
    if (unresolvedRegressions.length > 0) {
      toast.error("质量门禁尚未通过。", {
        description: `${unresolvedRegressions.length} 个 Case 仍为 regressed 或 unknown，请先重跑或人工评分。`,
      });
      return;
    }
    if (repository.experiments.length >= MAX_EVALUATION_EXPERIMENTS) {
      toast.error("最多保存 10 个实验。", {
        description: "请先导出并删除一个旧实验，再创建下一轮。",
      });
      return;
    }
    const plan = planEvaluationPromotion(activeExperiment, thread);
    if (plan.status === "conflict") {
      toast.error("当前 Thread 已在实验外发生变化。", {
        description: "请从最新 Thread 新建实验，系统不会静默覆盖。",
      });
      return;
    }
    if (plan.status === "no_changes") {
      toast.error("Candidate 与当前 Thread 没有可应用差异。");
      return;
    }
    captureGuestEvaluationEvent("promotion_diff_opened", {
      experiment: activeExperiment,
    });
    setPromotionPlan(plan);
  }, [
    activeExperiment,
    activeExperimentIsImmutable,
    isRunning,
    repository.experiments.length,
    thread,
  ]);

  const confirmPromotion = useCallback(() => {
    if (!activeExperiment || promotionPlan?.status !== "ready") return;
    const result = onApplyCandidate(activeExperiment);
    if (!result.ok) {
      toast.error("无法应用 Candidate", { description: result.error });
      setPromotionPlan(null);
      return;
    }
    const next = createNextEvaluationExperiment({
      parent: activeExperiment,
      thread: result.thread,
    });
    persistRepository(
      (current) => addGuestEvaluationExperiment(current, next) ?? current
    );
    captureGuestEvaluationEvent("promotion_applied", {
      experiment: activeExperiment,
    });
    captureGuestEvaluationEvent("next_round_created", { experiment: next });
    setPromotionPlan(null);
    toast.success("Candidate 已应用，并创建下一轮 Baseline。", {
      description: "原实验保持不变；可使用工作台 Undo 撤销 Thread 修改。",
    });
  }, [activeExperiment, onApplyCandidate, persistRepository, promotionPlan]);

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
              <span className="bg-primary/15 text-primary rounded px-1.5 py-0.5 text-[0.625rem] font-semibold">
                Quality Gate V2
              </span>
            </div>
            <DialogDescription>
              用版本化 Case Set 对比、识别回归并显式晋升
              Candidate；旧实验保持不变。
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
              <Button
                variant="outline"
                onClick={createDraft}
                disabled={isRunning}
              >
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
                onClick={() => caseSetInputRef.current?.click()}
                disabled={
                  !activeExperiment ||
                  isRunning ||
                  activeExperiment.runs.length > 0
                }
              >
                <FileUpIcon /> 导入 Case Set
              </Button>
              <input
                ref={caseSetInputRef}
                className="hidden"
                type="file"
                accept="application/json,.json"
                onChange={importCaseSet}
              />
              <Button
                variant="outline"
                onClick={exportCaseSet}
                disabled={!activeExperiment}
              >
                <DownloadIcon /> 导出 Case Set
              </Button>
              <Button
                variant="outline"
                onClick={exportExperiment}
                disabled={!activeExperiment}
              >
                <DownloadIcon /> 导出实验
              </Button>
              <Button
                variant="outline"
                onClick={() => exportReport("html")}
                disabled={
                  !activeExperiment || activeExperiment.runs.length === 0
                }
              >
                <DownloadIcon /> 脱敏报告 HTML
              </Button>
              <Button
                variant="outline"
                onClick={() => exportReport("json")}
                disabled={
                  !activeExperiment || activeExperiment.runs.length === 0
                }
              >
                <DownloadIcon /> 脱敏报告 JSON
              </Button>
              <Button
                variant="ghost"
                className="text-destructive hover:text-destructive"
                onClick={() => setDeleteConfirmOpen(true)}
                disabled={
                  !activeExperiment || isRunning || activeExperimentIsImmutable
                }
              >
                <Trash2Icon /> 删除实验
              </Button>
              <div className="text-muted-foreground mt-auto hidden text-[0.625rem] md:block">
                已保存 {repository.experiments.length}/
                {MAX_EVALUATION_EXPERIMENTS}
              </div>
            </aside>

            <main className="min-h-0 min-w-0 flex-1 overflow-y-auto p-3 sm:p-5">
              {storageError ? (
                <div
                  role="alert"
                  className="border-destructive/30 bg-destructive/10 text-destructive mb-4 rounded-lg border p-3"
                >
                  {storageError}
                </div>
              ) : null}
              {activeExperiment ? (
                <ExperimentEditor
                  experiment={activeExperiment}
                  quota={quota}
                  isRunning={isRunning}
                  immutable={activeExperimentIsImmutable}
                  onChange={commitExperiment}
                  onStart={startExperiment}
                  onStop={stopExperiment}
                  onContinue={continueExperiment}
                  onRunSelected={runSelectedCases}
                  onRerunFailedOrRegressed={rerunFailedOrRegressed}
                  onRequestPromotion={requestPromotion}
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
                  <FlaskConicalIcon className="text-muted-foreground size-10" />
                  <div className="font-medium">还没有评测实验</div>
                  <p className="text-muted-foreground max-w-sm">
                    从当前 Thread 创建 Baseline 与 Candidate，并用最多 50 个
                    Case 分批验证改动。
                  </p>
                  <Button onClick={createDraft}>创建第一个实验</Button>
                </div>
              )}
            </main>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={traceRun !== null}
        onOpenChange={(next) => !next && setTraceRun(null)}
      >
        <DialogContent className="flex h-[85vh] max-w-[min(900px,calc(100%-2rem))] flex-col p-0">
          <DialogHeader className="border-b px-4 py-3 pr-12">
            <DialogTitle>实验 Trace</DialogTitle>
            <DialogDescription>
              {traceRun?.variantId === "baseline" ? "Baseline" : "Candidate"} ·{" "}
              {traceRun?.modelTurns ?? 0} 个模型回合
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
        open={promotionPlan?.status === "ready"}
        onOpenChange={(next) => !next && setPromotionPlan(null)}
        title="应用 Candidate 并创建下一轮？"
        description={
          promotionPlan?.status === "ready" ? (
            <span className="grid gap-3 text-left">
              <span>
                只会修改以下白名单字段。原实验不会改变；当前 Thread
                的其他消息、Tools、Variables 与 Run history 保持不变。
              </span>
              <span className="grid gap-2">
                {promotionPlan.changes.map((change) => (
                  <span key={change.field} className="rounded border p-2">
                    <span className="text-foreground block font-medium">
                      {change.label}
                    </span>
                    <span className="mt-1 block text-xs break-words">
                      <span className="text-muted-foreground">原值：</span>
                      <span className="whitespace-pre-wrap">
                        {formatPromotionValue(change.before)}
                      </span>
                    </span>
                    <span className="mt-1 block text-xs break-words">
                      <span className="text-muted-foreground">新值：</span>
                      <span className="whitespace-pre-wrap">
                        {formatPromotionValue(change.after)}
                      </span>
                    </span>
                  </span>
                ))}
              </span>
            </span>
          ) : undefined
        }
        cancelLabel="取消"
        confirmLabel="应用并创建下一轮"
        confirmVariant="default"
        onConfirm={confirmPromotion}
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
  immutable,
  onChange,
  onStart,
  onStop,
  onContinue,
  onRunSelected,
  onRerunFailedOrRegressed,
  onRequestPromotion,
  onRetry,
  onTrace,
  onScore,
}: {
  experiment: EvaluationExperiment;
  quota: GuestQuota | null;
  isRunning: boolean;
  immutable: boolean;
  onChange: (
    transform: (value: EvaluationExperiment) => EvaluationExperiment
  ) => void;
  onStart: () => void;
  onStop: () => void;
  onContinue: () => void;
  onRunSelected: () => void;
  onRerunFailedOrRegressed: () => void;
  onRequestPromotion: () => void;
  onRetry: (run: EvaluationExperimentRun) => void;
  onTrace: (run: EvaluationExperimentRun) => void;
  onScore: (pair: {
    baseline: EvaluationExperimentRun;
    candidate: EvaluationExperimentRun;
  }) => void;
}) {
  const frozen = experiment.runs.length > 0;
  const selectedCases = selectedEvaluationCases(experiment);
  const budget = evaluationBudget(selectedCases.length);
  const remaining = quota
    ? Math.min(quota.browserRemaining, quota.ipRemaining)
    : 0;
  const insufficientQuota =
    selectedCases.length === 0 || !quota || remaining < budget;
  const aggregates = aggregateEvaluationExperiment(experiment);
  const regressions = classifyEvaluationRegressions(experiment);
  const regressionByCaseId = new Map(
    regressions.map((regression) => [regression.caseId, regression])
  );
  const rerunTargetCount = evaluationRerunTargets(experiment).length;
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
      <section className="bg-card/40 rounded-xl border p-4">
        {immutable ? (
          <div className="mb-4 rounded-lg border border-sky-500/30 bg-sky-500/10 p-3 text-sky-200">
            该实验已晋升并成为下一轮的父实验，配置、结果和人工评分现已只读。
          </div>
        ) : null}
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
        <div className="bg-muted/20 text-muted-foreground mt-3 rounded-lg border p-3">
          Tools、Variables、消息前缀和安全策略在两侧保持一致。自动工具：
          {toolNames.length > 0 ? toolNames.join("、") : "无"}。
        </div>
      </section>

      <section className="bg-card/40 rounded-xl border p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h3 className="font-medium">测试 Case</h3>
            <p className="text-muted-foreground">
              最多 50 条纯文本输入；当前批次选择 {selectedCases.length}/
              {experiment.cases.length}，规则均为可选。
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={
              frozen ||
              isRunning ||
              experiment.cases.length >= MAX_EVALUATION_CASES
            }
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
              selected={experiment.selectedCaseIds.includes(evaluationCase.id)}
              index={index}
              count={experiment.cases.length}
              toolNames={toolNames}
              readonly={frozen || isRunning}
              selectionDisabled={isRunning || immutable}
              onSelectedChange={(selected) =>
                onChange((value) => ({
                  ...value,
                  selectedCaseIds: selected
                    ? Array.from(
                        new Set([...value.selectedCaseIds, evaluationCase.id])
                      )
                    : value.selectedCaseIds.filter(
                        (id) => id !== evaluationCase.id
                      ),
                }))
              }
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

      <section className="bg-card/40 rounded-xl border p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-medium">额度与执行</h3>
            <p className="text-muted-foreground">
              当前批次 {selectedCases.length} Case × 2 变体 × 最多 3 回合 = 最坏{" "}
              {budget} 次 Run；当前剩余 {remaining} 次。
            </p>
            {insufficientQuota && !frozen ? (
              <p className="text-destructive mt-1">
                剩余额度不足，暂时不能开始。额度恢复时间：
                {quota?.resetsAt
                  ? new Date(quota.resetsAt).toLocaleString()
                  : "未知"}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            {isRunning ? (
              <Button variant="destructive" onClick={onStop}>
                <SquareIcon /> 停止实验
              </Button>
            ) : frozen ? (
              <>
                <Button
                  variant="outline"
                  onClick={onContinue}
                  disabled={!canContinue || immutable}
                >
                  <RotateCcwIcon /> 继续未完成项
                </Button>
                <Button
                  variant="outline"
                  onClick={onRerunFailedOrRegressed}
                  disabled={rerunTargetCount === 0 || immutable}
                >
                  <RotateCcwIcon /> 重跑失败/回归 ({rerunTargetCount})
                </Button>
                <Button
                  onClick={onRunSelected}
                  disabled={insufficientQuota || immutable}
                >
                  <FlaskConicalIcon /> 运行所选 Case
                </Button>
              </>
            ) : (
              <Button
                onClick={onStart}
                disabled={insufficientQuota || immutable}
              >
                <FlaskConicalIcon /> 检查额度并开始
              </Button>
            )}
          </div>
        </div>
        {experiment.runs.length > 0 ? (
          <div className="mt-3">
            <div className="text-muted-foreground mb-1 flex justify-between text-[0.625rem]">
              <span>进度</span>
              <span>
                {progress}/{experiment.runs.length}
              </span>
            </div>
            <div className="bg-muted h-2 overflow-hidden rounded-full">
              <div
                className="bg-primary h-full transition-[width]"
                style={{
                  width: `${experiment.runs.length ? (progress / experiment.runs.length) * 100 : 0}%`,
                }}
              />
            </div>
          </div>
        ) : null}
      </section>

      {experiment.runs.length > 0 ? (
        <section className="bg-card/40 rounded-xl border p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-medium">聚合结果与回归</h3>
              <p className="text-muted-foreground">
                improved / regressed
                优先使用确定性检查与人工评分；没有足够质量证据时标记 unknown。
              </p>
            </div>
            <Button
              onClick={onRequestPromotion}
              disabled={
                experiment.status !== "completed" || isRunning || immutable
              }
            >
              <GitCompareArrowsIcon /> Candidate 用于下一轮
            </Button>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {aggregates.map((aggregate) => (
              <div key={aggregate.variantId} className="rounded-lg border p-3">
                <div className="font-medium capitalize">
                  {aggregate.variantId}
                </div>
                <div className="text-muted-foreground mt-2 grid grid-cols-2 gap-2">
                  <span>完成</span>
                  <span className="text-foreground text-right">
                    {aggregate.completed}/{aggregate.total}
                  </span>
                  <span>规则通过</span>
                  <span className="text-foreground text-right">
                    {aggregate.checksPassed}/{aggregate.checksTotal}
                  </span>
                  <span>平均 Token</span>
                  <span className="text-foreground text-right">
                    {formatNumber(aggregate.averageTokens)}
                  </span>
                  <span>平均回合</span>
                  <span className="text-foreground text-right">
                    {formatNumber(aggregate.averageModelTurns)}
                  </span>
                  <span>平均耗时</span>
                  <span className="text-foreground text-right">
                    {formatDuration(aggregate.averageDurationMs)}
                  </span>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 grid gap-3">
            {experiment.cases.map((evaluationCase) => {
              const baseline = findResult(
                experiment,
                evaluationCase.id,
                "baseline"
              );
              const candidate = findResult(
                experiment,
                evaluationCase.id,
                "candidate"
              );
              return (
                <ResultRow
                  key={evaluationCase.id}
                  evaluationCase={evaluationCase}
                  baseline={baseline}
                  candidate={candidate}
                  regression={regressionByCaseId.get(evaluationCase.id)}
                  running={isRunning}
                  onRetry={onRetry}
                  onTrace={onTrace}
                  onScore={
                    !immutable && baseline?.run && candidate?.run
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
      <p className="text-muted-foreground mb-3">{description}</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="grid gap-1">
          <span>模型</span>
          <Select
            value={model.id}
            disabled={readonly}
            onValueChange={(id) =>
              onModelChange?.({ ...model, provider: "bigmodel", id })
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {GUEST_FALLBACK_PROVIDER.models.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.name}
                </SelectItem>
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
  selected,
  index,
  count,
  toolNames,
  readonly,
  selectionDisabled,
  onSelectedChange,
  onUpdate,
  onMove,
  onRemove,
}: {
  evaluationCase: EvaluationCase;
  selected: boolean;
  index: number;
  count: number;
  toolNames: string[];
  readonly: boolean;
  selectionDisabled: boolean;
  onSelectedChange: (selected: boolean) => void;
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
      expectations: {
        ...evaluationCase.expectations,
        [key]: value || undefined,
      },
    });
  return (
    <div className="rounded-lg border p-3">
      <div className="mb-2 flex items-center gap-2">
        <label className="text-muted-foreground flex shrink-0 items-center gap-1.5 text-xs">
          <input
            type="checkbox"
            checked={selected}
            disabled={selectionDisabled}
            aria-label={`选择 ${evaluationCase.name} 进入当前批次`}
            onChange={(event) => onSelectedChange(event.target.checked)}
          />
          本批次
        </label>
        <Input
          value={evaluationCase.name}
          disabled={readonly}
          aria-label={`Case ${index + 1} 名称`}
          onChange={(event) =>
            onUpdate({ ...evaluationCase, name: event.target.value })
          }
        />
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`上移 ${evaluationCase.name}`}
          disabled={readonly || index === 0}
          onClick={() => onMove(-1)}
        >
          <ArrowUpIcon />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`下移 ${evaluationCase.name}`}
          disabled={readonly || index === count - 1}
          onClick={() => onMove(1)}
        >
          <ArrowDownIcon />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`删除 ${evaluationCase.name}`}
          disabled={readonly || count === 1}
          onClick={onRemove}
        >
          <Trash2Icon />
        </Button>
      </div>
      <label className="grid gap-1">
        <span>用户输入</span>
        <Textarea
          className="min-h-20"
          disabled={readonly}
          value={evaluationCase.input}
          onChange={(event) =>
            onUpdate({ ...evaluationCase, input: event.target.value })
          }
        />
      </label>
      <div className="mt-3 grid gap-3 md:grid-cols-3">
        <label className="grid gap-1">
          <span>必须包含</span>
          <Input
            disabled={readonly}
            value={evaluationCase.expectations.requiredText ?? ""}
            onChange={(event) =>
              updateExpectation("requiredText", event.target.value)
            }
          />
        </label>
        <label className="grid gap-1">
          <span>不得包含</span>
          <Input
            disabled={readonly}
            value={evaluationCase.expectations.forbiddenText ?? ""}
            onChange={(event) =>
              updateExpectation("forbiddenText", event.target.value)
            }
          />
        </label>
        <label className="grid gap-1">
          <span>预期 Tool</span>
          <Select
            value={evaluationCase.expectations.expectedToolName ?? "none"}
            disabled={readonly}
            onValueChange={(value) =>
              updateExpectation(
                "expectedToolName",
                value === "none" ? "" : value
              )
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">不检查</SelectItem>
              {toolNames.map((name) => (
                <SelectItem key={name} value={name}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
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
  regression,
  running,
  onRetry,
  onTrace,
  onScore,
}: {
  evaluationCase: EvaluationCase;
  baseline?: EvaluationExperimentRun;
  candidate?: EvaluationExperimentRun;
  regression?: EvaluationRegressionResult;
  running: boolean;
  onRetry: (run: EvaluationExperimentRun) => void;
  onTrace: (run: EvaluationExperimentRun) => void;
  onScore?: () => void;
}) {
  return (
    <div className="rounded-lg border p-3">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="font-medium">{evaluationCase.name}</div>
          {regression ? <RegressionPill regression={regression} /> : null}
        </div>
        {onScore ? (
          <Button variant="outline" size="sm" onClick={onScore}>
            人工评分
          </Button>
        ) : null}
      </div>
      {regression ? (
        <p className="text-muted-foreground mb-3 text-xs">
          {regression.reason}
          {regression.tokenDelta === null
            ? ""
            : ` · Token Δ ${formatSignedNumber(regression.tokenDelta)}`}
          {regression.durationDeltaMs === null
            ? ""
            : ` · 耗时 Δ ${formatSignedNumber(regression.durationDeltaMs)} ms`}
        </p>
      ) : null}
      <div className="grid gap-3 lg:grid-cols-2">
        <ResultCell
          label="Baseline"
          result={baseline}
          running={running}
          onRetry={onRetry}
          onTrace={onTrace}
        />
        <ResultCell
          label="Candidate"
          result={candidate}
          running={running}
          onRetry={onRetry}
          onTrace={onTrace}
        />
      </div>
    </div>
  );
}

function RegressionPill({
  regression,
}: {
  regression: EvaluationRegressionResult;
}) {
  return (
    <span
      title={regression.reason}
      className={cn(
        "rounded-full border px-2 py-0.5 text-[0.625rem] font-medium",
        regression.status === "improved" &&
          "border-emerald-500/30 text-emerald-300",
        regression.status === "regressed" &&
          "border-destructive/30 text-destructive",
        regression.status === "unchanged" && "border-sky-500/30 text-sky-300",
        regression.status === "unknown" && "border-amber-500/30 text-amber-300"
      )}
    >
      {regression.status}
    </span>
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
    <div className="bg-muted/20 min-w-0 rounded-md p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium">{label}</span>
        <RunStatus status={result?.status ?? "queued"} />
      </div>
      {output ? (
        <p className="text-foreground/90 mt-2 max-h-32 overflow-y-auto whitespace-pre-wrap">
          {output}
        </p>
      ) : null}
      {result?.errorMessage ? (
        <p className="mt-2 text-amber-300">{result.errorMessage}</p>
      ) : null}
      {result ? (
        <div className="text-muted-foreground mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[0.625rem]">
          <span>{result.modelTurns} 回合</span>
          <span>{formatDuration(result.durationMs)}</span>
          <span>{result.toolNames.length} Tool</span>
        </div>
      ) : null}
      {result?.checks.length ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {result.checks.map((check) => (
            <span
              key={`${check.type}:${check.label}`}
              className={cn(
                "rounded px-1.5 py-0.5 text-[0.625rem]",
                check.passed
                  ? "bg-emerald-500/15 text-emerald-300"
                  : "bg-destructive/15 text-destructive"
              )}
            >
              {check.passed ? "✓" : "×"} {check.label}
            </span>
          ))}
        </div>
      ) : null}
      {result ? (
        <div className="mt-3 flex gap-2">
          {result.run ? (
            <Button variant="ghost" size="sm" onClick={() => onTrace(result)}>
              <EyeIcon /> Trace
            </Button>
          ) : null}
          {["failed", "aborted"].includes(result.status) ? (
            <Button
              variant="ghost"
              size="sm"
              disabled={running}
              onClick={() => onRetry(result)}
            >
              <RotateCcwIcon /> 重试
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function StatusPill({ status }: { status: EvaluationExperiment["status"] }) {
  const labels = {
    draft: "草稿",
    running: "运行中",
    partial: "部分完成",
    completed: "已完成",
  };
  return (
    <span className="text-muted-foreground rounded-full border px-2 py-1 text-[0.625rem]">
      {labels[status]}
    </span>
  );
}

function RunStatus({ status }: { status: EvaluationExperimentRun["status"] }) {
  const labels = {
    queued: "等待",
    running: "运行中",
    completed: "完成",
    failed: "失败",
    aborted: "已停止",
    needs_review: "需人工确认",
  };
  const Icon =
    status === "completed"
      ? CheckCircle2Icon
      : status === "running"
        ? LoaderCircleIcon
        : status === "failed"
          ? XCircleIcon
          : status === "needs_review"
            ? TriangleAlertIcon
            : SquareIcon;
  return (
    <span
      className={cn(
        "flex items-center gap-1 text-[0.625rem]",
        status === "completed" && "text-emerald-300",
        ["failed", "needs_review"].includes(status) && "text-amber-300"
      )}
    >
      <Icon className={cn("size-3", status === "running" && "animate-spin")} />
      {labels[status]}
    </span>
  );
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

function ensureRuns(
  experiment: EvaluationExperiment,
  targets: { caseId: string; variantId: EvaluationVariantId }[]
): EvaluationExperiment {
  const runs = [...experiment.runs];
  for (const target of targets) {
    if (
      runs.some(
        (run) =>
          run.caseId === target.caseId && run.variantId === target.variantId
      )
    ) {
      continue;
    }
    runs.push({
      id: crypto.randomUUID(),
      caseId: target.caseId,
      variantId: target.variantId,
      status: "queued",
      modelTurns: 0,
      durationMs: 0,
      toolNames: [],
      checks: [],
    });
  }
  return { ...experiment, runs };
}

function findResult(
  experiment: EvaluationExperiment,
  caseId: string,
  variantId: EvaluationVariantId
) {
  return experiment.runs.find(
    (run) => run.caseId === caseId && run.variantId === variantId
  );
}

function moveCase(
  cases: EvaluationCase[],
  from: number,
  to: number
): EvaluationCase[] {
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
  if (
    experiment.cases.length < 1 ||
    experiment.cases.length > MAX_EVALUATION_CASES
  )
    return "实验需要 1-50 个 Case。";
  if (selectedEvaluationCases(experiment).length === 0)
    return "请至少选择一个 Case 进入当前批次。";
  if (experiment.cases.some((item) => !item.name.trim() || !item.input.trim()))
    return "每个 Case 都需要名称和用户输入。";
  const temperature = experiment.candidate.model.params?.temperature;
  if (temperature !== undefined && (temperature < 0 || temperature > 2))
    return "Temperature 必须在 0-2 之间。";
  return null;
}

function lastAssistantText(
  run: NonNullable<EvaluationExperimentRun["run"]>
): string {
  const message = [...(run.thread.context?.messages ?? [])]
    .reverse()
    .find((item) => item.role === "assistant");
  return message ? getMessageText(message) : "";
}

function safeFilename(value: string): string {
  const printable = [...value.trim()]
    .filter((character) => character.charCodeAt(0) >= 32)
    .join("");
  return printable.replace(/[<>:"/\\|?*]/g, "-").slice(0, 80) || "evaluation";
}

function downloadText(filename: string, content: string, type: string): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function formatPromotionValue(value: string | number | null): string {
  if (value === null || value === "") return "（空）";
  return String(value);
}

function formatSignedNumber(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

function evaluationToolNames(
  tools: NonNullable<EvaluationExperiment["sourceThread"]["context"]>["tools"]
): string[] {
  return (tools ?? []).flatMap((tool) =>
    "name" in tool && typeof tool.name === "string" ? [tool.name] : []
  );
}

function formatNumber(value: number | null): string {
  return value === null
    ? "—"
    : new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 1 }).format(
        value
      );
}

function formatDuration(value: number | null): string {
  if (value === null) return "—";
  return value < 1000
    ? `${Math.round(value)} ms`
    : `${(value / 1000).toFixed(1)} s`;
}

function _browserStorage(): Storage {
  if (typeof window === "undefined") {
    return {
      getItem: () => null,
      setItem: () => undefined,
    } as unknown as Storage;
  }
  return window.localStorage;
}
