import {
  isExecutableTool,
  type AgentTransport,
  type ThreadSnapshot,
} from "@llm-space/core";
import {
  aggregateMessageUsage,
  buildEvaluationRunThread,
  evaluateExperimentRun,
  isRunSnapshot,
  MAX_EVALUATION_MODEL_TURNS,
  type EvaluationCase,
  type EvaluationExperiment,
  type EvaluationExperimentRun,
  type EvaluationVariantId,
  type RunSnapshot,
} from "@llm-space/core/thread";
import { createThreadStore } from "@llm-space/ui/components/thread-playground";

import { classifyGuestRunFailure } from "./guest-first-success";
import { GUEST_SKILLS_PATH, listGuestSkills } from "./guest-skills";
import {
  canGuestAutoExecute,
  executeGuestTool,
} from "./guest-tools";

export async function runGuestEvaluationItem(input: {
  experiment: EvaluationExperiment;
  evaluationCase: EvaluationCase;
  variantId: EvaluationVariantId;
  transport: AgentTransport;
  runtimeId: string;
  signal?: AbortSignal;
  now?: () => number;
  createId?: () => string;
}): Promise<EvaluationExperimentRun> {
  const now = input.now ?? Date.now;
  const createId = input.createId ?? (() => crypto.randomUUID());
  const startedAt = now();
  const initialThread = buildEvaluationRunThread(
    input.experiment,
    input.evaluationCase,
    input.variantId
  );
  const initialMessageCount = initialThread.context?.messages?.length ?? 0;
  const store = createThreadStore(initialThread, {
    transport: input.transport,
    runtimeId: input.runtimeId,
    resolveModel: (model) => model ?? null,
    prepareRun: () => ({ autoRunTools: true, reactLoop: true }),
    executeTool: async (tool, args) => {
      const result = await executeGuestTool(tool, args, input.runtimeId);
      return {
        content: [{ type: "text", text: result.contentText }],
        isError: result.isError,
      };
    },
    canAutoExecuteTool: canGuestAutoExecute,
    maxAutoToolTurns: MAX_EVALUATION_MODEL_TURNS,
    maxAutoToolCalls: 8,
    loadSkills: () => Promise.resolve(listGuestSkills(GUEST_SKILLS_PATH)),
    loadFile: () => Promise.resolve(""),
    fileExists: () => Promise.resolve(false),
    captureRunResults: true,
  });
  const abort = () => store.getState().abort();
  input.signal?.addEventListener("abort", abort, { once: true });
  try {
    if (input.signal?.aborted) {
      abort();
    } else {
      await store.getState().run();
    }
  } finally {
    input.signal?.removeEventListener("abort", abort);
  }
  const completedAt = now();
  const state = store.getState();
  const messages = state.thread.context?.messages ?? [];
  const generatedMessages = messages.slice(initialMessageCount);
  const modelTurns = generatedMessages.filter(
    (message) => message.role === "assistant"
  ).length;
  const newest = state.runHistory.at(-1);
  const recordedRun = newest && isRunSnapshot(newest) ? newest : null;
  const fallbackRun = snapshotFromThread(
    state.thread,
    createId(),
    completedAt,
    aggregateMessageUsage(generatedMessages)
  );
  const run = recordedRun ?? fallbackRun;
  const evidence = evaluateExperimentRun(run, input.evaluationCase.expectations);
  const toolsByName = new Map(
    (run.thread.context?.tools ?? [])
      .filter(isExecutableTool)
      .map((tool) => [tool.name, tool])
  );
  const pendingReview = (run.thread.context?.messages ?? []).some(
    (message) =>
      message.role === "assistant" &&
      message.toolCalls?.some((call) => {
        const tool = toolsByName.get(call.input.name);
        return tool ? !canGuestAutoExecute(tool) : !call.output;
      })
  );
  const result = state.lastRunResult;
  let status: EvaluationExperimentRun["status"] = "completed";
  let errorCategory: string | undefined;
  let errorMessage: string | undefined;
  if (result?.outcome === "aborted") {
    status = "aborted";
  } else if (result?.outcome === "failed") {
    status = "failed";
    errorCategory = classifyGuestRunFailure(result.error).category;
    errorMessage = "本次运行失败，可单独重试。";
  } else if (pendingReview) {
    status = "needs_review";
    errorCategory = "tool_review";
    errorMessage = "模型请求了需要人工确认的工具，实验未自动执行。";
  }
  return {
    id: createId(),
    caseId: input.evaluationCase.id,
    variantId: input.variantId,
    status,
    run,
    modelTurns,
    durationMs: Math.max(0, completedAt - startedAt),
    toolNames: evidence.toolNames,
    checks: evidence.checks,
    ...(errorCategory ? { errorCategory } : {}),
    ...(errorMessage ? { errorMessage } : {}),
    startedAt,
    completedAt,
  };
}

function snapshotFromThread(
  thread: {
    title?: string;
    model?: ThreadSnapshot["model"];
    context?: ThreadSnapshot["context"];
  },
  id: string,
  timestamp: number,
  usage: ReturnType<typeof aggregateMessageUsage>
): RunSnapshot {
  return {
    id,
    timestamp,
    ...(usage ? { usage } : {}),
    thread: structuredClone({
      ...(thread.title ? { title: thread.title } : {}),
      ...(thread.model ? { model: thread.model } : {}),
      ...(thread.context ? { context: thread.context } : {}),
    }),
  };
}
