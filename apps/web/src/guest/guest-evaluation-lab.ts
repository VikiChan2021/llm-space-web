import {
  EVALUATION_LAB_VERSION,
  LEGACY_EVALUATION_LAB_VERSION,
  MAX_EVALUATION_EXPERIMENTS,
  aggregateEvaluationExperiment,
  classifyEvaluationRegressions,
  evaluationReviewSummary,
  createEvaluationCaseSet,
  emptyEvaluationLabRepository,
  normalizeEvaluationCaseSet,
  normalizeEvaluationLabRepository,
  planEvaluationPromotion,
  type EvaluationCase,
  type EvaluationCaseSet,
  type EvaluationExperiment,
  type EvaluationLabRepository,
} from "@llm-space/core/thread";

export const GUEST_EVALUATION_LAB_STORAGE_KEY =
  "llm-space.guest.evaluation-lab.v2";
export const LEGACY_GUEST_EVALUATION_LAB_STORAGE_KEY =
  "llm-space.guest.evaluation-lab.v1";
export const MAX_EVALUATION_IMPORT_BYTES = 2 * 1024 * 1024;
export const MAX_EVALUATION_CASE_SET_IMPORT_BYTES = 512 * 1024;

export interface EvaluationLabStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

export function loadGuestEvaluationLab(storage: EvaluationLabStorage): {
  repository: EvaluationLabRepository;
  storageError: string | null;
} {
  try {
    const currentRaw = storage.getItem(GUEST_EVALUATION_LAB_STORAGE_KEY);
    const legacyRaw = currentRaw
      ? null
      : storage.getItem(LEGACY_GUEST_EVALUATION_LAB_STORAGE_KEY);
    const raw = currentRaw ?? legacyRaw;
    if (!raw) {
      return { repository: emptyEvaluationLabRepository(), storageError: null };
    }
    const repository = normalizeEvaluationLabRepository(JSON.parse(raw));
    if (repository) {
      if (legacyRaw) {
        const storageError = saveGuestEvaluationLab(storage, repository);
        if (!storageError) {
          try {
            storage.removeItem?.(LEGACY_GUEST_EVALUATION_LAB_STORAGE_KEY);
          } catch {
            // The V2 write succeeded; retaining the legacy backup is harmless.
          }
        }
        return { repository, storageError };
      }
      return { repository, storageError: null };
    }
    return {
      repository: emptyEvaluationLabRepository(),
      storageError: "本地评测数据格式无效，已忽略损坏内容。",
    };
  } catch {
    return {
      repository: emptyEvaluationLabRepository(),
      storageError: "当前浏览器无法读取评测数据。关闭页面前请导出重要实验。",
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
  return addGuestEvaluationExperiment(repository, experiment) ?? repository;
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
    (payload.version !== EVALUATION_LAB_VERSION &&
      payload.version !== LEGACY_EVALUATION_LAB_VERSION)
  ) {
    throw new Error("评测文件版本不受支持。");
  }
  const repository = normalizeEvaluationLabRepository({
    version: payload.version,
    experiments: [payload.experiment],
  });
  const experiment = repository?.experiments[0];
  if (!experiment) throw new Error("评测文件缺少有效实验。");
  return experiment;
}

export function serializeGuestEvaluationCaseSet(
  name: string,
  cases: EvaluationCase[]
): string {
  return JSON.stringify(createEvaluationCaseSet(name, cases), null, 2);
}

export function parseGuestEvaluationCaseSetImport(
  text: string
): EvaluationCaseSet {
  if (
    new TextEncoder().encode(text).byteLength >
    MAX_EVALUATION_CASE_SET_IMPORT_BYTES
  ) {
    throw new Error("Case Set 文件不能超过 512 KB。");
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error("Case Set 文件不是有效 JSON。");
  }
  const caseSet = normalizeEvaluationCaseSet(value);
  if (!caseSet) throw new Error("Case Set 文件格式或版本不受支持。");
  return caseSet;
}

export interface GuestEvaluationReport {
  format: "llm-space-quality-gate-report";
  version: 2;
  generatedAt: string;
  experimentId: string;
  lineage?: EvaluationExperiment["lineage"];
  changedFields: string[];
  aggregate: ReturnType<typeof aggregateEvaluationExperiment>;
  summary: Record<"improved" | "regressed" | "unchanged" | "unknown", number>;
  review: ReturnType<typeof evaluationReviewSummary>;
  cases: {
    caseId: string;
    label: string;
    status: "improved" | "regressed" | "unchanged" | "unknown";
    reason: string;
    checkDelta: number | null;
    tokenDelta: number | null;
    modelTurnDelta: number | null;
    durationDeltaMs: number | null;
    baselineChecks: { passed: number; total: number };
    candidateChecks: { passed: number; total: number };
  }[];
}

export function createGuestEvaluationReport(
  experiment: EvaluationExperiment,
  now = Date.now()
): GuestEvaluationReport {
  const regressions = classifyEvaluationRegressions(experiment);
  const summary = {
    improved: 0,
    regressed: 0,
    unchanged: 0,
    unknown: 0,
  };
  const promotion = planEvaluationPromotion(
    experiment,
    experiment.sourceThread
  );
  const cases = regressions.map((regression, index) => {
    summary[regression.status] += 1;
    const baseline = experiment.runs.find(
      (run) => run.caseId === regression.caseId && run.variantId === "baseline"
    );
    const candidate = experiment.runs.find(
      (run) => run.caseId === regression.caseId && run.variantId === "candidate"
    );
    const checks = (run: typeof baseline) => ({
      passed: run?.checks.filter((check) => check.passed).length ?? 0,
      total: run?.checks.length ?? 0,
    });
    return {
      caseId: regression.caseId,
      label: `Case ${index + 1}`,
      status: regression.status,
      reason: regression.reason,
      checkDelta: regression.checkDelta,
      tokenDelta: regression.tokenDelta,
      modelTurnDelta: regression.modelTurnDelta,
      durationDeltaMs: regression.durationDeltaMs,
      baselineChecks: checks(baseline),
      candidateChecks: checks(candidate),
    };
  });
  return {
    format: "llm-space-quality-gate-report",
    version: 2,
    generatedAt: new Date(now).toISOString(),
    experimentId: experiment.id,
    ...(experiment.lineage
      ? { lineage: structuredClone(experiment.lineage) }
      : {}),
    changedFields:
      promotion.status === "no_changes"
        ? []
        : promotion.changes.map((change) => change.field),
    aggregate: aggregateEvaluationExperiment(experiment),
    summary,
    review: evaluationReviewSummary(experiment),
    cases,
  };
}

export function serializeGuestEvaluationReport(
  experiment: EvaluationExperiment,
  now = Date.now()
): string {
  return JSON.stringify(createGuestEvaluationReport(experiment, now), null, 2);
}

export function serializeGuestEvaluationReportHtml(
  experiment: EvaluationExperiment,
  now = Date.now()
): string {
  const report = createGuestEvaluationReport(experiment, now);
  const rows = report.cases
    .map(
      (item) =>
        `<tr><td>${escapeHtml(item.label)}</td><td><span class="status ${item.status}">${escapeHtml(item.status)}</span></td><td>${escapeHtml(item.reason)}</td><td>${formatDelta(item.tokenDelta)}</td><td>${formatDelta(item.durationDeltaMs)}</td></tr>`
    )
    .join("");
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>LLM Space Quality Gate Report</title>
<style>body{margin:0;background:#0b1020;color:#e5e7eb;font:14px/1.5 system-ui,sans-serif}.page{max-width:960px;margin:auto;padding:40px 24px}h1{font-size:28px;margin:0 0 8px}p{color:#9ca3af}.cards{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:24px 0}.card,table{background:#111827;border:1px solid #263244;border-radius:12px}.card{padding:16px}.value{font-size:26px;font-weight:700}table{width:100%;border-collapse:collapse;overflow:hidden}th,td{text-align:left;padding:12px;border-bottom:1px solid #263244}th{color:#9ca3af}.status{font-weight:700}.improved{color:#34d399}.regressed{color:#fb7185}.unchanged{color:#93c5fd}.unknown{color:#fbbf24}.note{margin-top:20px;font-size:12px}@media(max-width:640px){.cards{grid-template-columns:repeat(2,1fr)}th:nth-child(n+4),td:nth-child(n+4){display:none}}</style></head>
<body><main class="page"><h1>LLM Space Quality Gate Report</h1><p>生成时间：${escapeHtml(report.generatedAt)} · 报告默认不包含 Prompt、Case 输入、模型输出、Tool 内容或密钥。</p>
<section class="cards">${(["improved", "regressed", "unchanged", "unknown"] as const).map((key) => `<div class="card"><div>${key}</div><div class="value ${key}">${report.summary[key]}</div></div>`).join("")}</section>
<p>人工评审：${report.review.manualReviewed} 已完成 · ${report.review.pending} 待评审 · ${report.review.automatic} 自动判定 · ${report.review.blocking} 门禁阻塞。</p>
<table><thead><tr><th>Case</th><th>结论</th><th>依据</th><th>Token Δ</th><th>耗时 Δ(ms)</th></tr></thead><tbody>${rows}</tbody></table>
<p class="note">Changed fields: ${report.changedFields.map(escapeHtml).join(", ") || "none"}. Unknown 表示需要人工评分或结果尚不完整，不应自动视为通过。</p></main></body></html>`;
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character] ?? character
  );
}

function formatDelta(value: number | null): string {
  if (value === null) return "—";
  return value > 0 ? `+${value}` : String(value);
}
