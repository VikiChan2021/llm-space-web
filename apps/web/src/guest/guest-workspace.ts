import {
  createDefaultThreadParserRegistry,
  normalizeThread,
  type Thread,
} from "@llm-space/core";

import { GUEST_MODEL_ID, GUEST_PROVIDER_ID } from "./guest-api";

export const GUEST_WORKSPACE_STORAGE_KEY = "llm-space.guest.workspace.v1";
export const LEGACY_GUEST_THREAD_STORAGE_KEY = "llm-space.guest.thread.v1";
export const MAX_GUEST_THREAD_IMPORT_BYTES = 1_048_576;

const WORKSPACE_VERSION = 1;
const DEFAULT_THREAD_TITLE = "游客体验工作台";

export interface GuestThreadRecord {
  id: string;
  thread: Thread;
  createdAt: string;
  updatedAt: string;
}

export interface GuestWorkspace {
  version: typeof WORKSPACE_VERSION;
  activeThreadId: string;
  threads: GuestThreadRecord[];
}

export interface GuestWorkspaceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface GuestWorkspaceFactory {
  createId: () => string;
  now: () => string;
}

export interface LoadGuestWorkspaceResult {
  workspace: GuestWorkspace;
  storageError: string | null;
  migratedLegacy: boolean;
}

const _parserRegistry = createDefaultThreadParserRegistry();

export function createStarterThread(createId: () => string): Thread {
  return {
    title: DEFAULT_THREAD_TITLE,
    model: {
      provider: GUEST_PROVIDER_ID,
      id: GUEST_MODEL_ID,
      params: { maxTokens: 2_048, reasoning: "off", temperature: 0.7 },
    },
    context: {
      systemPrompt:
        "你是一个严谨、友好的 AI 助手。优先给出清晰、可操作的中文回答。",
      messages: [
        {
          id: createId(),
          role: "user",
          content: [
            {
              type: "text",
              text: "请用三点说明：一个好的 Agent 工作台应当帮助开发者解决哪些问题？",
            },
          ],
        },
      ],
      tools: [],
    },
  };
}

export function loadGuestWorkspace(
  storage: GuestWorkspaceStorage,
  factory: GuestWorkspaceFactory
): LoadGuestWorkspaceResult {
  let savedWorkspaceRaw: string | null;
  let legacyThreadRaw: string | null;
  try {
    savedWorkspaceRaw = storage.getItem(GUEST_WORKSPACE_STORAGE_KEY);
    legacyThreadRaw = storage.getItem(LEGACY_GUEST_THREAD_STORAGE_KEY);
  } catch {
    return {
      workspace: createGuestWorkspace(factory),
      storageError:
        "当前浏览器禁止访问本地存储，本次修改只能保留到页面关闭。请先导出重要 Thread。",
      migratedLegacy: false,
    };
  }

  const savedWorkspace = _parseWorkspace(savedWorkspaceRaw);
  if (savedWorkspace) {
    return {
      workspace: savedWorkspace,
      storageError: null,
      migratedLegacy: false,
    };
  }

  const legacyThread = _parseLegacyThread(legacyThreadRaw);
  const workspace = createGuestWorkspace(factory, legacyThread ?? undefined);
  const storageError = saveGuestWorkspace(storage, workspace);

  if (!storageError && legacyThread) {
    try {
      storage.removeItem(LEGACY_GUEST_THREAD_STORAGE_KEY);
    } catch {
      // 新工作区已经写入成功；保留旧键不会影响后续读取。
    }
  }

  return {
    workspace,
    storageError,
    migratedLegacy: Boolean(legacyThread && !storageError),
  };
}

export function createGuestWorkspace(
  factory: GuestWorkspaceFactory,
  thread = createStarterThread(factory.createId)
): GuestWorkspace {
  const record = createGuestThreadRecord(thread, factory);
  return {
    version: WORKSPACE_VERSION,
    activeThreadId: record.id,
    threads: [record],
  };
}

export function createGuestThreadRecord(
  thread: Thread,
  factory: GuestWorkspaceFactory,
  existing: readonly GuestThreadRecord[] = []
): GuestThreadRecord {
  const timestamp = factory.now();
  return {
    id: factory.createId(),
    thread: {
      ...normalizeThread(thread),
      title: uniqueGuestThreadTitle(
        thread.title?.trim() || DEFAULT_THREAD_TITLE,
        existing
      ),
    },
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function addGuestThread(
  workspace: GuestWorkspace,
  thread: Thread,
  factory: GuestWorkspaceFactory
): GuestWorkspace {
  const record = createGuestThreadRecord(thread, factory, workspace.threads);
  return {
    ...workspace,
    activeThreadId: record.id,
    threads: [...workspace.threads, record],
  };
}

export function updateGuestThread(
  workspace: GuestWorkspace,
  recordId: string,
  thread: Thread,
  now: string
): GuestWorkspace {
  if (!workspace.threads.some((record) => record.id === recordId)) {
    return workspace;
  }
  return {
    ...workspace,
    threads: workspace.threads.map((record) =>
      record.id === recordId
        ? { ...record, thread: normalizeThread(thread), updatedAt: now }
        : record
    ),
  };
}

export function selectGuestThread(
  workspace: GuestWorkspace,
  recordId: string
): GuestWorkspace {
  if (
    workspace.activeThreadId === recordId ||
    !workspace.threads.some((record) => record.id === recordId)
  ) {
    return workspace;
  }
  return { ...workspace, activeThreadId: recordId };
}

export function duplicateGuestThread(
  workspace: GuestWorkspace,
  recordId: string,
  factory: GuestWorkspaceFactory
): GuestWorkspace {
  const source = workspace.threads.find((record) => record.id === recordId);
  if (!source) return workspace;
  return addGuestThread(
    workspace,
    {
      ...structuredClone(source.thread),
      title: `${source.thread.title?.trim() || DEFAULT_THREAD_TITLE} 副本`,
    },
    factory
  );
}

export function deleteGuestThread(
  workspace: GuestWorkspace,
  recordId: string,
  factory: GuestWorkspaceFactory
): GuestWorkspace {
  if (!workspace.threads.some((record) => record.id === recordId)) {
    return workspace;
  }
  const remaining = workspace.threads.filter(
    (record) => record.id !== recordId
  );
  if (remaining.length === 0) {
    return createGuestWorkspace(factory);
  }
  if (workspace.activeThreadId !== recordId) {
    return { ...workspace, threads: remaining };
  }
  const nextActive = [...remaining].sort((left, right) =>
    right.updatedAt.localeCompare(left.updatedAt)
  )[0];
  return {
    ...workspace,
    activeThreadId: nextActive.id,
    threads: remaining,
  };
}

export function resetGuestThread(
  workspace: GuestWorkspace,
  recordId: string,
  createId: () => string,
  now: string
): GuestWorkspace {
  const current = workspace.threads.find((record) => record.id === recordId);
  if (!current) return workspace;
  return updateGuestThread(
    workspace,
    recordId,
    {
      ...createStarterThread(createId),
      title: current.thread.title,
    },
    now
  );
}

export function uniqueGuestThreadTitle(
  requestedTitle: string,
  records: readonly GuestThreadRecord[],
  excludeId?: string
): string {
  const base = requestedTitle.trim() || DEFAULT_THREAD_TITLE;
  const used = new Set(
    records
      .filter((record) => record.id !== excludeId)
      .map((record) => record.thread.title?.trim())
      .filter((title): title is string => Boolean(title))
  );
  if (!used.has(base)) return base;
  let suffix = 2;
  while (used.has(`${base} (${suffix})`)) suffix += 1;
  return `${base} (${suffix})`;
}

export async function parseGuestThreadImport(
  fileName: string,
  raw: string
): Promise<Thread | undefined> {
  return _parserRegistry.parse(fileName, raw);
}

export function serializeGuestThread(thread: Thread): string {
  return `${JSON.stringify(normalizeThread(thread), null, 2)}\n`;
}

export function saveGuestWorkspace(
  storage: GuestWorkspaceStorage,
  workspace: GuestWorkspace
): string | null {
  try {
    storage.setItem(GUEST_WORKSPACE_STORAGE_KEY, JSON.stringify(workspace));
    return null;
  } catch {
    return "浏览器存储空间不足或当前不可用，最新修改尚未保存。请先导出重要 Thread。";
  }
}

function _parseLegacyThread(raw: string | null): Thread | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return _isRecord(parsed) ? normalizeThread(parsed) : null;
  } catch {
    return null;
  }
}

function _parseWorkspace(raw: string | null): GuestWorkspace | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!_isRecord(parsed) || parsed.version !== WORKSPACE_VERSION) return null;
    if (
      typeof parsed.activeThreadId !== "string" ||
      !Array.isArray(parsed.threads) ||
      parsed.threads.length === 0
    ) {
      return null;
    }

    const threads: GuestThreadRecord[] = [];
    for (const value of parsed.threads) {
      if (!_isRecord(value) || !_isRecord(value.thread)) return null;
      if (
        typeof value.id !== "string" ||
        typeof value.createdAt !== "string" ||
        typeof value.updatedAt !== "string"
      ) {
        return null;
      }
      threads.push({
        id: value.id,
        thread: normalizeThread(value.thread),
        createdAt: value.createdAt,
        updatedAt: value.updatedAt,
      });
    }
    if (!threads.some((record) => record.id === parsed.activeThreadId)) {
      return null;
    }
    return {
      version: WORKSPACE_VERSION,
      activeThreadId: parsed.activeThreadId,
      threads,
    };
  } catch {
    return null;
  }
}

function _isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
