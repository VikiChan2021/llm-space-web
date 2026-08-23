import {
  EVALUATION_LAB_VERSION,
  MAX_EVALUATION_EXPERIMENTS,
  emptyEvaluationLabRepository,
  normalizeEvaluationLabRepository,
  type EvaluationExperiment,
  type EvaluationLabRepository,
} from "@llm-space/core/thread";

export const GUEST_EVALUATION_LAB_STORAGE_KEY =
  "llm-space.guest.evaluation-lab.v1";
export const MAX_EVALUATION_IMPORT_BYTES = 2 * 1024 * 1024;

export interface EvaluationLabStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function loadGuestEvaluationLab(storage: EvaluationLabStorage): {
  repository: EvaluationLabRepository;
  storageError: string | null;
} {
  try {
    const raw = storage.getItem(GUEST_EVALUATION_LAB_STORAGE_KEY);
    if (!raw) {
      return { repository: emptyEvaluationLabRepository(), storageError: null };
    }
    const repository = normalizeEvaluationLabRepository(JSON.parse(raw));
    if (repository) return { repository, storageError: null };
    return {
      repository: emptyEvaluationLabRepository(),
      storageError: "本地评测数据格式无效，已忽略损坏内容。",
    };
  } catch {
    return {
      repository: emptyEvaluationLabRepository(),
      storageError:
        "当前浏览器无法读取评测数据。关闭页面前请导出重要实验。",
    };
  }
}

export function saveGuestEvaluationLab(
  storage: EvaluationLabStorage,
  repository: EvaluationLabRepository
): string | null {
  try {
    storage.setItem(
      GUEST_EVALUATION_LAB_STORAGE_KEY,
      JSON.stringify(repository)
    );
    return null;
  } catch {
    return "评测数据无法写入浏览器存储。请导出实验后释放空间。";
  }
}

export function addGuestEvaluationExperiment(
  repository: EvaluationLabRepository,
  experiment: EvaluationExperiment
): EvaluationLabRepository | null {
  if (
    repository.experiments.length >= MAX_EVALUATION_EXPERIMENTS &&
    !repository.experiments.some((item) => item.id === experiment.id)
  ) {
    return null;
  }
  const existing = repository.experiments.some(
    (item) => item.id === experiment.id
  );
  return {
    version: EVALUATION_LAB_VERSION,
    activeExperimentId: experiment.id,
    experiments: existing
      ? repository.experiments.map((item) =>
          item.id === experiment.id ? experiment : item
        )
      : [...repository.experiments, experiment],
  };
}

export function updateGuestEvaluationExperiment(
  repository: EvaluationLabRepository,
  experiment: EvaluationExperiment
): EvaluationLabRepository {
  return (
    addGuestEvaluationExperiment(repository, experiment) ?? repository
  );
}

export function selectGuestEvaluationExperiment(
  repository: EvaluationLabRepository,
  experimentId: string
): EvaluationLabRepository {
  if (!repository.experiments.some((item) => item.id === experimentId)) {
    return repository;
  }
  return { ...repository, activeExperimentId: experimentId };
}

export function deleteGuestEvaluationExperiment(
  repository: EvaluationLabRepository,
  experimentId: string
): EvaluationLabRepository {
  const experiments = repository.experiments.filter(
    (item) => item.id !== experimentId
  );
  if (experiments.length === repository.experiments.length) return repository;
  const nextActive =
    repository.activeExperimentId === experimentId
      ? experiments.at(-1)?.id
      : repository.activeExperimentId;
  return {
    version: EVALUATION_LAB_VERSION,
    experiments,
    ...(nextActive ? { activeExperimentId: nextActive } : {}),
  };
}

export function serializeGuestEvaluationLab(
  experiment: EvaluationExperiment
): string {
  return JSON.stringify(
    {
      format: "llm-space-evaluation-lab",
      version: EVALUATION_LAB_VERSION,
      experiment,
    },
    null,
    2
  );
}

export function parseGuestEvaluationLabImport(
  text: string
): EvaluationExperiment {
  if (new TextEncoder().encode(text).byteLength > MAX_EVALUATION_IMPORT_BYTES) {
    throw new Error("评测文件不能超过 2 MB。");
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error("评测文件不是有效 JSON。");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("评测文件格式无效。");
  }
  const payload = value as Record<string, unknown>;
  if (
    payload.format !== "llm-space-evaluation-lab" ||
    payload.version !== EVALUATION_LAB_VERSION
  ) {
    throw new Error("评测文件版本不受支持。");
  }
  const repository = normalizeEvaluationLabRepository({
    version: EVALUATION_LAB_VERSION,
    experiments: [payload.experiment],
  });
  const experiment = repository?.experiments[0];
  if (!experiment) throw new Error("评测文件缺少有效实验。");
  return experiment;
}
