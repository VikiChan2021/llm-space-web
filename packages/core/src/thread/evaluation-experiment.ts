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
import { type RunSnapshot } from "./run-history-entry";
import { usageForRun } from "./usage";

export const EVALUATION_LAB_VERSION = 1 as const;
export const MAX_EVALUATION_EXPERIMENTS = 10;
export const MAX_EVALUATION_CASES = 3;
export const MAX_EVALUATION_MODEL_TURNS = 3;

export type EvaluationVariantId = "baseline" | "candidate";
export type EvaluationExperimentStatus =
  | "draft"
  | "running"
  | "partial"
  | "completed";
export type EvaluationRunStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "aborted"
  | "needs_review";

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

export interface EvaluationExperiment {
  id: string;
  name: string;
  sourceThread: ThreadSnapshot;
  candidate: EvaluationCandidate;
  cases: EvaluationCase[];
  runs: EvaluationExperimentRun[];
  rubrics: ThreadEvaluationRubric[];
  evaluations: ThreadEvaluation[];
  status: EvaluationExperimentStatus;
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
  const initialInput = lastUserMessageText(sourceThread) || "请在这里输入测试问题";
  return {
    id: createId(),
    name: `${sourceThread.title?.trim() || "未命名 Thread"} · ${formatEvaluationDate(now)} 评测`,
    sourceThread,
    candidate: {
      model: structuredClone(sourceThread.model!),
      systemPrompt: sourceThread.context?.systemPrompt ?? "",
    },
    cases: [
      {
        id: createId(),
        name: "Case 1",
        input: initialInput,
        expectations: {},
      },
    ],
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
      passed: !normalizedOutput.includes(normalizeEvaluationText(forbiddenText)),
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
  if (!isRecord(value) || value.version !== EVALUATION_LAB_VERSION) {
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
  const cases = value.cases
    .map(normalizeCase)
    .filter((item): item is EvaluationCase => item !== null)
    .slice(0, MAX_EVALUATION_CASES);
  if (cases.length === 0) return null;
  const caseIds = new Set(cases.map((item) => item.id));
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
    runs,
    rubrics: normalizeEvaluationRubrics(
      value.rubrics as ThreadEvaluationRubric[] | undefined
    ),
    evaluations: normalizeEvaluations(
      value.evaluations as ThreadEvaluation[] | undefined,
      loadedRunHistory
    ),
    status: isExperimentStatus(value.status) ? value.status : "partial",
    createdAt: value.createdAt as number,
    updatedAt: value.updatedAt as number,
  };
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
      ? value.toolNames.filter((item): item is string => typeof item === "string")
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

function optionalString(
  value: unknown,
  key: string
): Record<string, string> {
  return typeof value === "string" && value.trim()
    ? { [key]: value.slice(0, 12_000) }
    : {};
}

function optionalNumber(
  value: unknown,
  key: string
): Record<string, number> {
  return typeof value === "number" && Number.isFinite(value)
    ? { [key]: value }
    : {};
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

function isExperimentStatus(value: unknown): value is EvaluationExperimentStatus {
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
