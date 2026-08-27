import { Compile } from "typebox/compile";

import {
  getMessageText,
  ModelConfig as ModelConfigSchema,
  type ModelConfig,
  type ModelUsage,
  type Thread,
  ThreadSnapshot as ThreadSnapshotSchema,
  type ThreadEvaluation,
  type ThreadEvaluationRubric,
  type ThreadRunSnapshot,
  type ThreadSnapshot,
} from "../types";
import { uuid } from "../utils";

import { normalizeEvaluationRubrics, normalizeEvaluations } from "./history";
import { findEvaluationForPair } from "./run-evaluation-utils";
import { type RunSnapshot } from "./run-history-entry";
import { usageForRun } from "./usage";

export const EVALUATION_LAB_VERSION = 2 as const;
export const LEGACY_EVALUATION_LAB_VERSION = 1 as const;
export const MAX_EVALUATION_EXPERIMENTS = 10;
export const MAX_EVALUATION_CASES = 50;
export const DEFAULT_EVALUATION_BATCH_CASES = 3;
export const MAX_EVALUATION_MODEL_TURNS = 3;

export type EvaluationVariantId = "baseline" | "candidate";
export type EvaluationExperimentStatus =
  "draft" | "running" | "partial" | "completed";
export type EvaluationRunStatus =
  "queued" | "running" | "completed" | "failed" | "aborted" | "needs_review";

export interface EvaluationExpectation {
  requiredText?: string;
  forbiddenText?: string;
  expectedToolName?: string;
}

export interface EvaluationCase {
  id: string;
  name: string;
  input: string;
  expectations: EvaluationExpectation;
}

export interface EvaluationCandidate {
  model: ModelConfig;
  systemPrompt: string;
}

export interface EvaluationCheckResult {
  type: "required_text" | "forbidden_text" | "expected_tool";
  label: string;
  passed: boolean;
}

export interface EvaluationExperimentRun {
  id: string;
  caseId: string;
  variantId: EvaluationVariantId;
  status: EvaluationRunStatus;
  modelTurns: number;
  durationMs: number;
  toolNames: string[];
  checks: EvaluationCheckResult[];
  run?: RunSnapshot;
  errorCategory?: string;
  errorMessage?: string;
  startedAt?: number;
  completedAt?: number;
}

export type EvaluationRegressionStatus =
  "improved" | "regressed" | "unchanged" | "unknown";

export interface EvaluationRegressionResult {
  caseId: string;
  status: EvaluationRegressionStatus;
  reason: string;
  checkDelta: number | null;
  tokenDelta: number | null;
  modelTurnDelta: number | null;
  durationDeltaMs: number | null;
}

export interface EvaluationReviewItem {
  caseId: string;
  baseline: EvaluationExperimentRun;
  candidate: EvaluationExperimentRun;
  regression: EvaluationRegressionResult;
  evaluation: ThreadEvaluation | null;
  needsReview: boolean;
}

export interface EvaluationReviewSummary {
  eligiblePairs: number;
  manualReviewed: number;
  pending: number;
  automatic: number;
  blocking: number;
  verdicts: Record<ThreadEvaluation["verdict"], number>;
}

export interface EvaluationExperimentLineage {
  parentExperimentId: string;
  promotionId: string;
  promotedAt: number;
}

export interface EvaluationExperiment {
  id: string;
  name: string;
  sourceThread: ThreadSnapshot;
  candidate: EvaluationCandidate;
  cases: EvaluationCase[];
  selectedCaseIds: string[];
  runs: EvaluationExperimentRun[];
  rubrics: ThreadEvaluationRubric[];
  evaluations: ThreadEvaluation[];
  status: EvaluationExperimentStatus;
  lineage?: EvaluationExperimentLineage;
  createdAt: number;
  updatedAt: number;
}

export interface EvaluationLabRepository {
  version: typeof EVALUATION_LAB_VERSION;
  activeExperimentId?: string;
  experiments: EvaluationExperiment[];
}

export interface EvaluationVariantAggregate {
  variantId: EvaluationVariantId;
  completed: number;
  total: number;
  checksPassed: number;
  checksTotal: number;
  averageTokens: number | null;
  averageModelTurns: number | null;
  averageDurationMs: number | null;
}

export type EvaluationPromotionField =
  "model" | "temperature" | "maxTokens" | "systemPrompt";

export interface EvaluationPromotionChange {
  field: EvaluationPromotionField;
  label: string;
  before: string | number | null;
  after: string | number | null;
}

export type EvaluationPromotionPlan =
  | {
      status: "ready";
      changes: EvaluationPromotionChange[];
      nextThread: Thread;
    }
  | {
      status: "conflict";
      changes: EvaluationPromotionChange[];
      conflictFields: EvaluationPromotionField[];
    }
  | {
      status: "no_changes";
      changes: [];
    };

export interface EvaluationCaseSet {
  format: "llm-space-evaluation-case-set";
  version: 1;
  name: string;
  cases: EvaluationCase[];
}

const threadSnapshotValidator = Compile(ThreadSnapshotSchema);
const modelConfigValidator = Compile(ModelConfigSchema);

export function createEvaluationExperiment(input: {
  thread: Thread;
  model: ModelConfig;
  now?: number;
  createId?: () => string;
}): EvaluationExperiment {
  const now = input.now ?? Date.now();
  const createId = input.createId ?? uuid;
  const sourceThread = snapshotEvaluationSource(input.thread, input.model);
  const initialInput =
    lastUserMessageText(sourceThread) || "请在这里输入测试问题";
  const experimentId = createId();
  const initialCase: EvaluationCase = {
    id: createId(),
    name: "Case 1",
    input: initialInput,
    expectations: {},
  };
  return {
    id: experimentId,
    name: `${sourceThread.title?.trim() || "未命名 Thread"} · ${formatEvaluationDate(now)} 评测`,
    sourceThread,
    candidate: {
      model: structuredClone(sourceThread.model!),
      systemPrompt: sourceThread.context?.systemPrompt ?? "",
    },
    cases: [initialCase],
    selectedCaseIds: [initialCase.id],
    runs: [],
    rubrics: [],
    evaluations: [],
    status: "draft",
    createdAt: now,
    updatedAt: now,
  };
}

/** Keep only model-facing Thread state; experiment runs never inherit history. */
export function snapshotEvaluationSource(
  thread: Thread,
  fallbackModel: ModelConfig
): ThreadSnapshot {
  return structuredClone({
    ...(thread.title ? { title: thread.title } : {}),
    model: thread.model ?? fallbackModel,
    context: thread.context ?? { messages: [] },
  });
}

export function validateEvaluationSource(
  source: ThreadSnapshot
): string | null {
  if (!source.model) return "当前 Thread 没有可运行模型。";
  const messages = source.context?.messages ?? [];
  if (!messages.some((message) => message.role === "user")) {
    return "当前 Thread 至少需要一条 User 消息。";
  }
  if (
    messages.some((message) =>
      message.content.some((content) => content.type !== "text")
    )
  ) {
    return "Evaluation Lab V1 只支持纯文本 Thread。请先移除图片或文件内容。";
  }
  if (
    Object.values(source.context?.variables ?? {}).some(
      (variable) => variable.type === "file"
    )
  ) {
    return "Evaluation Lab V1 暂不支持 File 变量。";
  }
  return null;
}

export function evaluationBudget(
  caseCount: number,
  maxTurns = MAX_EVALUATION_MODEL_TURNS
): number {
  const boundedCases = Math.max(
    0,
    Math.min(MAX_EVALUATION_CASES, Math.trunc(caseCount))
  );
  const boundedTurns = Math.max(
    1,
    Math.min(MAX_EVALUATION_MODEL_TURNS, Math.trunc(maxTurns))
  );
  return boundedCases * 2 * boundedTurns;
}

export function selectedEvaluationCases(
  experiment: EvaluationExperiment
): EvaluationCase[] {
  const selected = new Set(experiment.selectedCaseIds);
  return experiment.cases.filter((evaluationCase) =>
    selected.has(evaluationCase.id)
  );
}

export function planEvaluationPromotion(
  experiment: EvaluationExperiment,
  currentThread: Thread
): EvaluationPromotionPlan {
  const baseline = promotionFields(experiment.sourceThread);
  const current = promotionFields(currentThread);
  const candidate = promotionCandidateFields(experiment);
  const conflictFields = PROMOTION_FIELDS.filter(
    (field) => !promotionValueEquals(baseline[field], current[field])
  );
  const changes = PROMOTION_FIELDS.flatMap((field) =>
    promotionValueEquals(current[field], candidate[field])
      ? []
      : [
          {
            field,
            label: PROMOTION_LABELS[field],
            before: current[field],
            after: candidate[field],
          },
        ]
  );
  if (conflictFields.length > 0) {
    return { status: "conflict", changes, conflictFields };
  }
  if (changes.length === 0) {
    return { status: "no_changes", changes: [] };
  }
  const currentModel = currentThread.model ?? experiment.sourceThread.model!;
  const params = { ...(currentModel.params ?? {}) };
  setOptionalModelParam(
    params,
    "temperature",
    experiment.candidate.model.params?.temperature
  );
  setOptionalModelParam(
    params,
    "maxTokens",
    experiment.candidate.model.params?.maxTokens
  );
  return {
    status: "ready",
    changes,
    nextThread: {
      ...structuredClone(currentThread),
      model: {
        ...structuredClone(currentModel),
        provider: experiment.candidate.model.provider,
        id: experiment.candidate.model.id,
        params,
      },
      context: {
        ...(structuredClone(currentThread.context) ?? { messages: [] }),
        systemPrompt: experiment.candidate.systemPrompt,
      },
    },
  };
}

export function createNextEvaluationExperiment(input: {
  parent: EvaluationExperiment;
  thread: Thread;
  now?: number;
  createId?: () => string;
}): EvaluationExperiment {
  const now = input.now ?? Date.now();
  const createId = input.createId ?? uuid;
  const sourceThread = snapshotEvaluationSource(
    input.thread,
    input.parent.candidate.model
  );
  const promotionId = createId();
  return {
    id: createId(),
    name: `${input.parent.name.replace(/（下一轮.*）$/, "")}（下一轮 ${formatEvaluationDate(now)}）`,
    sourceThread,
    candidate: {
      model: structuredClone(sourceThread.model!),
      systemPrompt: sourceThread.context?.systemPrompt ?? "",
    },
    cases: structuredClone(input.parent.cases),
    selectedCaseIds: input.parent.selectedCaseIds.filter((id) =>
      input.parent.cases.some((evaluationCase) => evaluationCase.id === id)
    ),
    runs: [],
    rubrics: structuredClone(input.parent.rubrics),
    evaluations: [],
    status: "draft",
    lineage: {
      parentExperimentId: input.parent.id,
      promotionId,
      promotedAt: now,
    },
    createdAt: now,
    updatedAt: now,
  };
}

export function classifyEvaluationRegressions(
  experiment: EvaluationExperiment
): EvaluationRegressionResult[] {
  return experiment.cases.map((evaluationCase) => {
    const baseline = findExperimentRun(
      experiment,
      evaluationCase.id,
      "baseline"
    );
    const candidate = findExperimentRun(
      experiment,
      evaluationCase.id,
      "candidate"
    );
    const metrics = regressionMetrics(baseline, candidate);
    if (
      baseline?.status !== "completed" ||
      candidate?.status !== "completed" ||
      !baseline.run ||
      !candidate.run
    ) {
      return {
        caseId: evaluationCase.id,
        status: "unknown",
        reason: "Baseline 与 Candidate 尚未都有完整结果。",
        ...metrics,
      };
    }
    const checkDelta = passedCheckCount(candidate) - passedCheckCount(baseline);
    if (checkDelta !== 0) {
      return {
        caseId: evaluationCase.id,
        status: checkDelta > 0 ? "improved" : "regressed",
        reason:
          checkDelta > 0
            ? `Candidate 多通过 ${checkDelta} 项确定性检查。`
            : `Candidate 少通过 ${Math.abs(checkDelta)} 项确定性检查。`,
        ...metrics,
        checkDelta,
      };
    }
    const evaluation = findEvaluationForPair(
      experiment.evaluations,
      baseline.run.id,
      candidate.run.id
    );
    if (evaluation?.verdict === "rightBetter") {
      return {
        caseId: evaluationCase.id,
        status: "improved",
        reason: "人工评分认为 Candidate 更好。",
        ...metrics,
        checkDelta,
      };
    }
    if (evaluation?.verdict === "leftBetter") {
      return {
        caseId: evaluationCase.id,
        status: "regressed",
        reason: "人工评分认为 Baseline 更好。",
        ...metrics,
        checkDelta,
      };
    }
    if (evaluation?.verdict === "tie" || evaluation?.verdict === "pass") {
      return {
        caseId: evaluationCase.id,
        status: "unchanged",
        reason:
          evaluation.verdict === "tie"
            ? "人工评分认为两侧表现相同。"
            : "人工评分认为两侧都满足要求。",
        ...metrics,
        checkDelta,
      };
    }
    return {
      caseId: evaluationCase.id,
      status: "unknown",
      reason:
        evaluation?.verdict === "fail"
          ? "人工评分认为两侧都未满足要求。"
          : "确定性检查相同，尚需人工评分确认质量变化。",
      ...metrics,
      checkDelta,
    };
  });
}

export function evaluationReviewItems(
  experiment: EvaluationExperiment
): EvaluationReviewItem[] {
  const regressions = new Map(
    classifyEvaluationRegressions(experiment).map((item) => [item.caseId, item])
  );
  return experiment.cases.flatMap((evaluationCase) => {
    const baseline = findExperimentRun(
      experiment,
      evaluationCase.id,
      "baseline"
    );
    const candidate = findExperimentRun(
      experiment,
      evaluationCase.id,
      "candidate"
    );
    const regression = regressions.get(evaluationCase.id);
    if (
      baseline?.status !== "completed" ||
      candidate?.status !== "completed" ||
      !baseline.run ||
      !candidate.run ||
      !regression
    ) {
      return [];
    }
    const evaluation = findEvaluationForPair(
      experiment.evaluations,
      baseline.run.id,
      candidate.run.id
    );
    return [
      {
        caseId: evaluationCase.id,
        baseline,
        candidate,
        regression,
        evaluation,
        needsReview: regression.status === "unknown" && !evaluation,
      },
    ];
  });
}

export function evaluationReviewSummary(
  experiment: EvaluationExperiment
): EvaluationReviewSummary {
  const items = evaluationReviewItems(experiment);
  const verdicts: EvaluationReviewSummary["verdicts"] = {
    leftBetter: 0,
    rightBetter: 0,
    tie: 0,
    pass: 0,
    fail: 0,
  };
  for (const item of items) {
    if (item.evaluation) verdicts[item.evaluation.verdict] += 1;
  }
  return {
    eligiblePairs: items.length,
    manualReviewed: items.filter((item) => item.evaluation).length,
    pending: items.filter((item) => item.needsReview).length,
    automatic: items.filter(
      (item) => !item.evaluation && item.regression.status !== "unknown"
    ).length,
    blocking: classifyEvaluationRegressions(experiment).filter(
      (item) => item.status === "regressed" || item.status === "unknown"
    ).length,
    verdicts,
  };
}

export function evaluationRerunTargets(
  experiment: EvaluationExperiment
): { caseId: string; variantId: EvaluationVariantId }[] {
  const targets = new Map<string, EvaluationVariantId>();
  for (const run of experiment.runs) {
    if (["failed", "aborted", "needs_review"].includes(run.status)) {
      targets.set(`${run.caseId}:${run.variantId}`, run.variantId);
    }
  }
  for (const regression of classifyEvaluationRegressions(experiment)) {
    if (regression.status !== "regressed") continue;
    targets.set(`${regression.caseId}:baseline`, "baseline");
    targets.set(`${regression.caseId}:candidate`, "candidate");
  }
  return [...targets].map(([key, variantId]) => ({
    caseId: key.slice(0, key.lastIndexOf(":")),
    variantId,
  }));
}

export function createEvaluationCaseSet(
  name: string,
  cases: EvaluationCase[]
): EvaluationCaseSet {
  return {
    format: "llm-space-evaluation-case-set",
    version: 1,
    name: name.trim().slice(0, 120) || "未命名 Case Set",
    cases: normalizeCases(cases),
  };
}

export function normalizeEvaluationCaseSet(
  value: unknown
): EvaluationCaseSet | null {
  if (
    !isRecord(value) ||
    value.format !== "llm-space-evaluation-case-set" ||
    value.version !== 1 ||
    typeof value.name !== "string" ||
    !Array.isArray(value.cases)
  ) {
    return null;
  }
  const cases = normalizeCases(value.cases);
  if (cases.length === 0) return null;
  return {
    format: "llm-space-evaluation-case-set",
    version: 1,
    name: value.name.slice(0, 120),
    cases,
  };
}

export function buildEvaluationRunThread(
  experiment: EvaluationExperiment,
  evaluationCase: EvaluationCase,
  variantId: EvaluationVariantId
): Thread {
  const source = structuredClone(experiment.sourceThread);
  const messages = [...(source.context?.messages ?? [])];
  let userIndex = -1;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role === "user") {
      userIndex = index;
      break;
    }
  }
  if (userIndex < 0) {
    throw new Error("Evaluation source needs a User message.");
  }
  const user = messages[userIndex];
  if (!user) {
    throw new Error("Evaluation source needs a User message.");
  }
  messages[userIndex] = {
    ...user,
    content: [{ type: "text", text: evaluationCase.input }],
  };
  const candidate = experiment.candidate;
  return {
    ...source,
    model:
      variantId === "candidate"
        ? structuredClone(candidate.model)
        : structuredClone(source.model),
    context: {
      ...source.context,
      systemPrompt:
        variantId === "candidate"
          ? candidate.systemPrompt
          : source.context?.systemPrompt,
      messages: messages.slice(0, userIndex + 1),
      // The case input changed, so model-facing values must render again.
      snapshot: undefined,
    },
  };
}

export function evaluateExperimentRun(
  run: RunSnapshot,
  expectation: EvaluationExpectation
): {
  output: string;
  toolNames: string[];
  checks: EvaluationCheckResult[];
} {
  const messages = run.thread.context?.messages ?? [];
  const assistant = [...messages]
    .reverse()
    .find((message) => message.role === "assistant");
  const output = assistant ? getMessageText(assistant) : "";
  const toolNames = Array.from(
    new Set(
      messages.flatMap((message) =>
        message.role === "assistant"
          ? (message.toolCalls ?? []).map((call) => call.input.name)
          : []
      )
    )
  );
  const normalizedOutput = normalizeEvaluationText(output);
  const checks: EvaluationCheckResult[] = [];
  const requiredText = expectation.requiredText?.trim();
  if (requiredText) {
    checks.push({
      type: "required_text",
      label: `包含“${requiredText}”`,
      passed: normalizedOutput.includes(normalizeEvaluationText(requiredText)),
    });
  }
  const forbiddenText = expectation.forbiddenText?.trim();
  if (forbiddenText) {
    checks.push({
      type: "forbidden_text",
      label: `不包含“${forbiddenText}”`,
      passed: !normalizedOutput.includes(
        normalizeEvaluationText(forbiddenText)
      ),
    });
  }
  const expectedToolName = expectation.expectedToolName?.trim();
  if (expectedToolName) {
    checks.push({
      type: "expected_tool",
      label: `调用 ${expectedToolName}`,
      passed: toolNames.includes(expectedToolName),
    });
  }
  return { output, toolNames, checks };
}

export function aggregateEvaluationExperiment(
  experiment: EvaluationExperiment
): EvaluationVariantAggregate[] {
  return (["baseline", "candidate"] as const).map((variantId) => {
    const runs = experiment.runs.filter((run) => run.variantId === variantId);
    const completed = runs.filter((run) => run.status === "completed");
    const usage = completed
      .map((run) => (run.run ? usageForRun(run.run) : null))
      .filter((value): value is ModelUsage => value !== null);
    const checks = completed.flatMap((run) => run.checks);
    return {
      variantId,
      completed: completed.length,
      total: experiment.cases.length,
      checksPassed: checks.filter((check) => check.passed).length,
      checksTotal: checks.length,
      averageTokens: average(
        usage.map(
          (value) =>
            value.totalTokens ||
            value.input + value.output + value.cacheRead + value.cacheWrite
        )
      ),
      averageModelTurns: average(completed.map((run) => run.modelTurns)),
      averageDurationMs: average(completed.map((run) => run.durationMs)),
    };
  });
}

export function normalizeEvaluationLabRepository(
  value: unknown
): EvaluationLabRepository | null {
  if (
    !isRecord(value) ||
    (value.version !== EVALUATION_LAB_VERSION &&
      value.version !== LEGACY_EVALUATION_LAB_VERSION)
  ) {
    return null;
  }
  if (!Array.isArray(value.experiments)) return null;
  const experiments = value.experiments
    .map(normalizeExperiment)
    .filter((item): item is EvaluationExperiment => item !== null)
    .slice(0, MAX_EVALUATION_EXPERIMENTS);
  const activeExperimentId =
    typeof value.activeExperimentId === "string" &&
    experiments.some((item) => item.id === value.activeExperimentId)
      ? value.activeExperimentId
      : undefined;
  return {
    version: EVALUATION_LAB_VERSION,
    experiments,
    ...(activeExperimentId ? { activeExperimentId } : {}),
  };
}

export function emptyEvaluationLabRepository(): EvaluationLabRepository {
  return { version: EVALUATION_LAB_VERSION, experiments: [] };
}

export function lastUserMessageText(source: ThreadSnapshot): string {
  const messages = source.context?.messages ?? [];
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role === "user") {
      return getMessageText(message);
    }
  }
  return "";
}

function normalizeExperiment(value: unknown): EvaluationExperiment | null {
  if (!isRecord(value) || !threadSnapshotValidator.Check(value.sourceThread)) {
    return null;
  }
  if (
    typeof value.id !== "string" ||
    typeof value.name !== "string" ||
    !isRecord(value.candidate) ||
    !modelConfigValidator.Check(value.candidate.model) ||
    typeof value.candidate.systemPrompt !== "string" ||
    !Array.isArray(value.cases) ||
    !Array.isArray(value.runs) ||
    !Number.isFinite(value.createdAt) ||
    !Number.isFinite(value.updatedAt)
  ) {
    return null;
  }
  const cases = normalizeCases(value.cases);
  if (cases.length === 0) return null;
  const caseIds = new Set(cases.map((item) => item.id));
  const selectedCaseIds = Array.isArray(value.selectedCaseIds)
    ? value.selectedCaseIds.filter(
        (id): id is string => typeof id === "string" && caseIds.has(id)
      )
    : cases
        .slice(0, DEFAULT_EVALUATION_BATCH_CASES)
        .map((evaluationCase) => evaluationCase.id);
  const runs = value.runs
    .map((run) => normalizeRun(run, caseIds))
    .filter((item): item is EvaluationExperimentRun => item !== null);
  const loadedRunHistory = runs
    .map((run) => run.run)
    .filter((run): run is RunSnapshot => Boolean(run));
  return {
    id: value.id,
    name: value.name.slice(0, 120),
    sourceThread: structuredClone(value.sourceThread),
    candidate: {
      model: structuredClone(value.candidate.model),
      systemPrompt: value.candidate.systemPrompt,
    },
    cases,
    selectedCaseIds:
      selectedCaseIds.length > 0
        ? Array.from(new Set(selectedCaseIds))
        : [cases[0]!.id],
    runs,
    rubrics: normalizeEvaluationRubrics(
      value.rubrics as ThreadEvaluationRubric[] | undefined
    ),
    evaluations: normalizeEvaluations(
      value.evaluations as ThreadEvaluation[] | undefined,
      loadedRunHistory
    ),
    status: isExperimentStatus(value.status) ? value.status : "partial",
    ...normalizeLineage(value.lineage),
    createdAt: value.createdAt as number,
    updatedAt: value.updatedAt as number,
  };
}

function normalizeCases(values: unknown[]): EvaluationCase[] {
  const seenIds = new Set<string>();
  return values
    .map(normalizeCase)
    .filter((item): item is EvaluationCase => {
      if (!item || seenIds.has(item.id)) return false;
      seenIds.add(item.id);
      return true;
    })
    .slice(0, MAX_EVALUATION_CASES);
}

function normalizeCase(value: unknown): EvaluationCase | null {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.name !== "string" ||
    typeof value.input !== "string"
  ) {
    return null;
  }
  const expectation = isRecord(value.expectations) ? value.expectations : {};
  return {
    id: value.id,
    name: value.name.slice(0, 80),
    input: value.input.slice(0, 12_000),
    expectations: {
      ...optionalString(expectation.requiredText, "requiredText"),
      ...optionalString(expectation.forbiddenText, "forbiddenText"),
      ...optionalString(expectation.expectedToolName, "expectedToolName"),
    },
  };
}

function normalizeRun(
  value: unknown,
  caseIds: ReadonlySet<string>
): EvaluationExperimentRun | null {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.caseId !== "string" ||
    !caseIds.has(value.caseId) ||
    (value.variantId !== "baseline" && value.variantId !== "candidate") ||
    !isRunStatus(value.status)
  ) {
    return null;
  }
  const run = isRecord(value.run)
    ? (structuredClone(value.run) as unknown as ThreadRunSnapshot)
    : undefined;
  const normalizedRun =
    run?.id && threadSnapshotValidator.Check(run.thread)
      ? ({ ...run, id: run.id } as RunSnapshot)
      : undefined;
  return {
    id: value.id,
    caseId: value.caseId,
    variantId: value.variantId,
    status: value.status,
    modelTurns: finiteNumber(value.modelTurns),
    durationMs: finiteNumber(value.durationMs),
    toolNames: Array.isArray(value.toolNames)
      ? value.toolNames.filter(
          (item): item is string => typeof item === "string"
        )
      : [],
    checks: Array.isArray(value.checks)
      ? (value.checks as EvaluationCheckResult[]).filter(
          (check) =>
            isRecord(check) &&
            typeof check.type === "string" &&
            typeof check.label === "string" &&
            typeof check.passed === "boolean"
        )
      : [],
    ...(normalizedRun ? { run: normalizedRun } : {}),
    ...optionalString(value.errorCategory, "errorCategory"),
    ...optionalString(value.errorMessage, "errorMessage"),
    ...optionalNumber(value.startedAt, "startedAt"),
    ...optionalNumber(value.completedAt, "completedAt"),
  };
}

function optionalString(value: unknown, key: string): Record<string, string> {
  return typeof value === "string" && value.trim()
    ? { [key]: value.slice(0, 12_000) }
    : {};
}

function optionalNumber(value: unknown, key: string): Record<string, number> {
  return typeof value === "number" && Number.isFinite(value)
    ? { [key]: value }
    : {};
}

const PROMOTION_FIELDS: EvaluationPromotionField[] = [
  "model",
  "temperature",
  "maxTokens",
  "systemPrompt",
];

const PROMOTION_LABELS: Record<EvaluationPromotionField, string> = {
  model: "模型",
  temperature: "Temperature",
  maxTokens: "Max Tokens",
  systemPrompt: "System Prompt",
};

type PromotionFields = Record<EvaluationPromotionField, string | number | null>;

function promotionFields(thread: ThreadSnapshot | Thread): PromotionFields {
  return {
    model: thread.model ? `${thread.model.provider}/${thread.model.id}` : "",
    temperature: thread.model?.params?.temperature ?? null,
    maxTokens: thread.model?.params?.maxTokens ?? null,
    systemPrompt: thread.context?.systemPrompt ?? "",
  };
}

function promotionCandidateFields(
  experiment: EvaluationExperiment
): PromotionFields {
  return {
    model: `${experiment.candidate.model.provider}/${experiment.candidate.model.id}`,
    temperature: experiment.candidate.model.params?.temperature ?? null,
    maxTokens: experiment.candidate.model.params?.maxTokens ?? null,
    systemPrompt: experiment.candidate.systemPrompt,
  };
}

function promotionValueEquals(
  left: string | number | null,
  right: string | number | null
): boolean {
  return left === right;
}

function setOptionalModelParam(
  params: NonNullable<ModelConfig["params"]>,
  key: "temperature" | "maxTokens",
  value: number | undefined
): void {
  if (value === undefined) {
    delete params[key];
  } else {
    params[key] = value;
  }
}

function findExperimentRun(
  experiment: EvaluationExperiment,
  caseId: string,
  variantId: EvaluationVariantId
): EvaluationExperimentRun | undefined {
  return experiment.runs.find(
    (run) => run.caseId === caseId && run.variantId === variantId
  );
}

function passedCheckCount(run: EvaluationExperimentRun): number {
  return run.checks.filter((check) => check.passed).length;
}

function regressionMetrics(
  baseline: EvaluationExperimentRun | undefined,
  candidate: EvaluationExperimentRun | undefined
): Pick<
  EvaluationRegressionResult,
  "checkDelta" | "tokenDelta" | "modelTurnDelta" | "durationDeltaMs"
> {
  const baselineUsage = baseline?.run ? usageForRun(baseline.run) : null;
  const candidateUsage = candidate?.run ? usageForRun(candidate.run) : null;
  const totalTokens = (usage: ModelUsage): number =>
    usage.totalTokens ||
    usage.input + usage.output + usage.cacheRead + usage.cacheWrite;
  return {
    checkDelta:
      baseline && candidate
        ? passedCheckCount(candidate) - passedCheckCount(baseline)
        : null,
    tokenDelta:
      baselineUsage && candidateUsage
        ? totalTokens(candidateUsage) - totalTokens(baselineUsage)
        : null,
    modelTurnDelta:
      baseline && candidate ? candidate.modelTurns - baseline.modelTurns : null,
    durationDeltaMs:
      baseline && candidate ? candidate.durationMs - baseline.durationMs : null,
  };
}

function normalizeLineage(
  value: unknown
): { lineage: EvaluationExperimentLineage } | Record<string, never> {
  if (
    !isRecord(value) ||
    typeof value.parentExperimentId !== "string" ||
    typeof value.promotionId !== "string" ||
    typeof value.promotedAt !== "number" ||
    !Number.isFinite(value.promotedAt)
  ) {
    return {};
  }
  return {
    lineage: {
      parentExperimentId: value.parentExperimentId,
      promotionId: value.promotionId,
      promotedAt: value.promotedAt,
    },
  };
}

function normalizeEvaluationText(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase();
}

function formatEvaluationDate(timestamp: number): string {
  const date = new Date(timestamp);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function finiteNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, value)
    : 0;
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isExperimentStatus(
  value: unknown
): value is EvaluationExperimentStatus {
  return (
    value === "draft" ||
    value === "running" ||
    value === "partial" ||
    value === "completed"
  );
}

function isRunStatus(value: unknown): value is EvaluationRunStatus {
  return (
    value === "queued" ||
    value === "running" ||
    value === "completed" ||
    value === "failed" ||
    value === "aborted" ||
    value === "needs_review"
  );
}
