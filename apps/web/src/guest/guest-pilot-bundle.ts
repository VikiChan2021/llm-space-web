import {
  normalizeThread,
  RecoverableThreadZodSchema,
  type Thread,
} from "@llm-space/core";
import {
  EVALUATION_LAB_VERSION,
  MAX_EVALUATION_EXPERIMENTS,
  createEvaluationCaseSet,
  normalizeEvaluationCaseSet,
  normalizeEvaluationLabRepository,
  type EvaluationCaseSet,
  type EvaluationExperiment,
  type EvaluationLabRepository,
} from "@llm-space/core/thread";

import {
  createGuestEvaluationReport,
  loadGuestEvaluationLab,
  saveGuestEvaluationLab,
  type EvaluationLabStorage,
  type GuestEvaluationReport,
} from "./guest-evaluation-lab";
import {
  addGuestThread,
  GUEST_WORKSPACE_STORAGE_KEY,
  saveGuestWorkspace,
  type GuestWorkspace,
  type GuestWorkspaceFactory,
  type GuestWorkspaceStorage,
} from "./guest-workspace";

export const GUEST_PILOT_BUNDLE_FORMAT = "llm-space-pilot-bundle";
export const GUEST_PILOT_BUNDLE_VERSION = 1;
export const MAX_GUEST_PILOT_BUNDLE_IMPORT_BYTES = 8 * 1024 * 1024;

export interface GuestPilotBundleCounts {
  experiments: number;
  cases: number;
  runs: number;
  evaluations: number;
}

export interface GuestPilotBundle {
  format: typeof GUEST_PILOT_BUNDLE_FORMAT;
  version: typeof GUEST_PILOT_BUNDLE_VERSION;
  exportedAt: string;
  content: {
    fullContent: true;
    warning: string;
  };
  thread: Thread;
  activeExperimentId: string;
  experiments: EvaluationExperiment[];
  caseSet: EvaluationCaseSet;
  report: GuestEvaluationReport;
  counts: GuestPilotBundleCounts;
}

export type GuestPilotBundleImportResult =
  | {
      ok: true;
      workspace: GuestWorkspace;
      repository: EvaluationLabRepository;
      activeExperiment: EvaluationExperiment;
      threadRecordId: string;
      counts: GuestPilotBundleCounts;
    }
  | { ok: false; error: string };

type GuestPilotBundleStorage = GuestWorkspaceStorage & EvaluationLabStorage;

export function createGuestPilotBundle(input: {
  thread: Thread;
  repository: EvaluationLabRepository;
  activeExperiment: EvaluationExperiment;
  now?: number;
}): GuestPilotBundle {
  const now = input.now ?? Date.now();
  const experiments = _experimentAncestry(
    input.repository,
    input.activeExperiment
  );
  const counts = _bundleCounts(experiments, input.activeExperiment);
  return {
    format: GUEST_PILOT_BUNDLE_FORMAT,
    version: GUEST_PILOT_BUNDLE_VERSION,
    exportedAt: new Date(now).toISOString(),
    content: {
      fullContent: true,
      warning:
        "此文件包含完整 Prompt、Case 输入、模型输出、Tool 证据与人工评审，仅应在可信设备和人员之间传递。",
    },
    thread: structuredClone(normalizeThread(input.thread)),
    activeExperimentId: input.activeExperiment.id,
    experiments,
    caseSet: createEvaluationCaseSet(
      input.activeExperiment.name,
      input.activeExperiment.cases
    ),
    report: createGuestEvaluationReport(input.activeExperiment, now),
    counts,
  };
}

export function serializeGuestPilotBundle(input: {
  thread: Thread;
  repository: EvaluationLabRepository;
  activeExperiment: EvaluationExperiment;
  now?: number;
}): string {
  return `${JSON.stringify(createGuestPilotBundle(input), null, 2)}\n`;
}

export function parseGuestPilotBundle(text: string): GuestPilotBundle {
  if (
    new TextEncoder().encode(text).byteLength >
    MAX_GUEST_PILOT_BUNDLE_IMPORT_BYTES
  ) {
    throw new Error("试点包不能超过 8 MiB。");
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error("试点包不是有效 JSON。");
  }
  if (!_isRecord(value)) throw new Error("试点包格式无效。");
  if (
    value.format !== GUEST_PILOT_BUNDLE_FORMAT ||
    value.version !== GUEST_PILOT_BUNDLE_VERSION
  ) {
    throw new Error("试点包格式或版本不受支持。");
  }
  if (!_isRecord(value.content) || value.content.fullContent !== true) {
    throw new Error("试点包缺少完整内容警告标记。");
  }
  const threadResult = RecoverableThreadZodSchema.safeParse(value.thread);
  if (!threadResult.success) throw new Error("试点包缺少有效 Thread。");
  if (
    typeof value.exportedAt !== "string" ||
    !Number.isFinite(Date.parse(value.exportedAt))
  ) {
    throw new Error("试点包缺少有效导出时间。");
  }
  if (
    typeof value.activeExperimentId !== "string" ||
    !Array.isArray(value.experiments)
  ) {
    throw new Error("试点包缺少有效实验链。");
  }
  const repository = normalizeEvaluationLabRepository({
    version: EVALUATION_LAB_VERSION,
    activeExperimentId: value.activeExperimentId,
    experiments: value.experiments,
  });
  const activeExperiment = repository?.experiments.find(
    (experiment) => experiment.id === repository.activeExperimentId
  );
  if (!repository || !activeExperiment) {
    throw new Error("试点包实验链无效或超出数量限制。");
  }
  const ancestry = _experimentAncestry(repository, activeExperiment);
  if (ancestry.length !== repository.experiments.length) {
    throw new Error("试点包只能包含当前实验及其连续祖先链。");
  }
  const caseSet = normalizeEvaluationCaseSet(value.caseSet);
  if (
    !caseSet ||
    JSON.stringify(caseSet.cases) !== JSON.stringify(activeExperiment.cases)
  ) {
    throw new Error("试点包 Case Set 与当前实验不一致。");
  }
  if (!_isRecord(value.report) || !_isRecord(value.counts)) {
    throw new Error("试点包缺少报告或证据计数。");
  }
  const reportTime =
    typeof value.report.generatedAt === "string"
      ? Date.parse(value.report.generatedAt)
      : Number.NaN;
  if (!Number.isFinite(reportTime)) {
    throw new Error("试点包脱敏报告时间无效。");
  }
  const report = createGuestEvaluationReport(activeExperiment, reportTime);
  if (JSON.stringify(value.report) !== JSON.stringify(report)) {
    throw new Error("试点包脱敏报告与实验证据不一致。");
  }
  const counts = _bundleCounts(ancestry, activeExperiment);
  if (!_countsEqual(value.counts, counts)) {
    throw new Error("试点包证据计数与实验内容不一致。");
  }
  return {
    format: GUEST_PILOT_BUNDLE_FORMAT,
    version: GUEST_PILOT_BUNDLE_VERSION,
    exportedAt: value.exportedAt,
    content: {
      fullContent: true,
      warning:
        "此文件包含完整 Prompt、Case 输入、模型输出、Tool 证据与人工评审，仅应在可信设备和人员之间传递。",
    },
    thread: structuredClone(normalizeThread(threadResult.data)),
    activeExperimentId: activeExperiment.id,
    experiments: ancestry,
    caseSet,
    report,
    counts,
  };
}

export function persistGuestPilotBundleImport(input: {
  storage: GuestPilotBundleStorage;
  workspace: GuestWorkspace;
  factory: GuestWorkspaceFactory;
  bundle: GuestPilotBundle;
}): GuestPilotBundleImportResult {
  let previousWorkspaceRaw: string | null;
  try {
    previousWorkspaceRaw = input.storage.getItem(GUEST_WORKSPACE_STORAGE_KEY);
  } catch {
    return { ok: false, error: "当前浏览器无法读取本地工作区。" };
  }
  const loaded = loadGuestEvaluationLab(input.storage);
  if (loaded.storageError) {
    return { ok: false, error: loaded.storageError };
  }
  let prepared: ReturnType<typeof _preparePilotBundleImport>;
  try {
    prepared = _preparePilotBundleImport(
      input.workspace,
      loaded.repository,
      input.factory,
      input.bundle
    );
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "无法准备试点包。",
    };
  }
  const workspaceError = saveGuestWorkspace(input.storage, prepared.workspace);
  if (workspaceError) return { ok: false, error: workspaceError };

  const evaluationError = saveGuestEvaluationLab(
    input.storage,
    prepared.repository
  );
  if (evaluationError) {
    const restored = _restoreStorageValue(
      input.storage,
      GUEST_WORKSPACE_STORAGE_KEY,
      previousWorkspaceRaw
    );
    return {
      ok: false,
      error: restored
        ? `${evaluationError} 工作区已回滚。`
        : `${evaluationError} 工作区回滚失败，请刷新并核对本地数据。`,
    };
  }
  return {
    ok: true,
    workspace: prepared.workspace,
    repository: prepared.repository,
    activeExperiment: prepared.activeExperiment,
    threadRecordId: prepared.threadRecordId,
    counts: input.bundle.counts,
  };
}

function _preparePilotBundleImport(
  workspace: GuestWorkspace,
  repository: EvaluationLabRepository,
  factory: GuestWorkspaceFactory,
  bundle: GuestPilotBundle
): {
  workspace: GuestWorkspace;
  repository: EvaluationLabRepository;
  activeExperiment: EvaluationExperiment;
  threadRecordId: string;
} {
  if (
    repository.experiments.length + bundle.experiments.length >
    MAX_EVALUATION_EXPERIMENTS
  ) {
    throw new Error(
      `试点包需要 ${bundle.experiments.length} 个实验槽位；请先导出并删除旧实验。`
    );
  }
  const usedIds = new Set(repository.experiments.map((item) => item.id));
  const idMap = new Map<string, string>();
  for (const experiment of bundle.experiments) {
    let nextId = factory.createId();
    while (usedIds.has(nextId)) nextId = factory.createId();
    usedIds.add(nextId);
    idMap.set(experiment.id, nextId);
  }
  const usedNames = new Set(repository.experiments.map((item) => item.name));
  const importedExperiments = bundle.experiments.map((experiment) => {
    const { lineage, ...rest } = structuredClone(experiment);
    const parentId = lineage
      ? idMap.get(lineage.parentExperimentId)
      : undefined;
    const name = _uniqueImportedName(experiment.name, usedNames);
    usedNames.add(name);
    return {
      ...rest,
      id: idMap.get(experiment.id)!,
      name,
      ...(lineage && parentId
        ? { lineage: { ...lineage, parentExperimentId: parentId } }
        : {}),
    };
  });
  const activeExperimentId = idMap.get(bundle.activeExperimentId);
  const activeExperiment = importedExperiments.find(
    (experiment) => experiment.id === activeExperimentId
  );
  if (!activeExperiment) throw new Error("无法定位试点包当前实验。");
  const nextWorkspace = addGuestThread(
    workspace,
    {
      ...structuredClone(bundle.thread),
      title: `${bundle.thread.title?.trim() || "导入的 Thread"} · 试点包`,
    },
    factory
  );
  const nextRepository: EvaluationLabRepository = {
    version: EVALUATION_LAB_VERSION,
    activeExperimentId: activeExperiment.id,
    experiments: [...repository.experiments, ...importedExperiments],
  };
  return {
    workspace: nextWorkspace,
    repository: nextRepository,
    activeExperiment,
    threadRecordId: nextWorkspace.activeThreadId,
  };
}

function _experimentAncestry(
  repository: EvaluationLabRepository,
  activeExperiment: EvaluationExperiment
): EvaluationExperiment[] {
  const byId = new Map(repository.experiments.map((item) => [item.id, item]));
  const visited = new Set<string>();
  const result: EvaluationExperiment[] = [];
  let current: EvaluationExperiment | undefined = activeExperiment;
  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    result.unshift(structuredClone(current));
    current = current.lineage
      ? byId.get(current.lineage.parentExperimentId)
      : undefined;
  }
  return result;
}

function _bundleCounts(
  experiments: readonly EvaluationExperiment[],
  activeExperiment: EvaluationExperiment
): GuestPilotBundleCounts {
  return {
    experiments: experiments.length,
    cases: activeExperiment.cases.length,
    runs: experiments.reduce((total, item) => total + item.runs.length, 0),
    evaluations: experiments.reduce(
      (total, item) => total + item.evaluations.length,
      0
    ),
  };
}

function _countsEqual(
  value: Record<string, unknown>,
  expected: GuestPilotBundleCounts
): boolean {
  return (
    value.experiments === expected.experiments &&
    value.cases === expected.cases &&
    value.runs === expected.runs &&
    value.evaluations === expected.evaluations
  );
}

function _uniqueImportedName(name: string, used: Set<string>): string {
  const base = `${name}（试点包）`;
  if (!used.has(base)) return base;
  let suffix = 2;
  while (used.has(`${base} (${suffix})`)) suffix += 1;
  return `${base} (${suffix})`;
}

function _restoreStorageValue(
  storage: GuestPilotBundleStorage,
  key: string,
  value: string | null
): boolean {
  try {
    if (value === null) storage.removeItem(key);
    else storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function _isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
