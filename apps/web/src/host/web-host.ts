import type { HostServices, ModelClient } from "@llm-space/ui/host";
import {
  LOCAL_STORAGE_KEYS,
  readLocalStorage,
  removeLocalStorage,
  writeLocalStorage,
} from "@llm-space/ui/lib/local-storage";

import {
  GUEST_FALLBACK_PROVIDER,
  GUEST_MODEL_ID,
  GUEST_PROVIDER_ID,
  isGuestModelConfigAvailable,
  readGuestModels,
} from "@/guest/guest-api";
import {
  listGuestMcpServers,
  listGuestMcpTools,
} from "@/guest/guest-mcp";
import {
  GUEST_SKILLS_PATH,
  listGuestSkills,
} from "@/guest/guest-skills";
import {
  canGuestAutoExecute,
  executeGuestTool,
  GUEST_BUILTIN_TOOLS,
} from "@/guest/guest-tools";

import { createOpenVariablesBridge } from "./web-action-bridge";

export const GUEST_WORKBENCH_ENABLED =
  import.meta.env.VITE_GUEST_WORKBENCH === "1";

export const OPEN_GUEST_SETTINGS_EVENT = "llm-space:guest-open-settings";

const openVariablesBridge = createOpenVariablesBridge();

/** Unavailable in the display-only viewer; never called while presentational. */
function unavailable(): never {
  throw new Error("This action is not available in the web viewer.");
}

/**
 * The web host remains browser-only. Guest mode enables editing and the
 * injected HTTP model transport, but intentionally exposes no local tools,
 * filesystem, MCP, generator, or desktop command bridge.
 */
export const webHost: HostServices = {
  presentational: !GUEST_WORKBENCH_ENABLED,
  transport: null,
  executeTool: GUEST_WORKBENCH_ENABLED
    ? (tool, args, options) =>
        executeGuestTool(tool, args, options?.runtimeId)
    : null,
  toolExecutionPolicy: GUEST_WORKBENCH_ENABLED
    ? {
        maxAutoTurns: 6,
        maxAutoToolCalls: 8,
        canAutoExecute: canGuestAutoExecute,
        notice:
          "游客模式只会自动运行低风险工具；写入、Custom Tool 和未信任 MCP 会停下等待确认。每个 ReAct 模型回合都会消耗一次免费 Run。",
      }
    : undefined,
  skills: {
    getSettings: () =>
      Promise.resolve({
        discoveryPaths: [{ path: GUEST_SKILLS_PATH, hiddenSkills: [] }],
      }),
    listSkills: (path) =>
      Promise.resolve(GUEST_WORKBENCH_ENABLED ? listGuestSkills(path) : []),
  },
  mcp: {
    listServers: () =>
      Promise.resolve(
        GUEST_WORKBENCH_ENABLED ? listGuestMcpServers() : []
      ),
    listTools: (serverId) =>
      GUEST_WORKBENCH_ENABLED
        ? listGuestMcpTools(serverId)
        : unavailable(),
  },
  builtinTools: {
    list: () =>
      Promise.resolve(GUEST_WORKBENCH_ENABLED ? GUEST_BUILTIN_TOOLS : []),
    fsReveal: () => unavailable(),
  },
  paths: {
    ensureRootDir: (relativePath) => Promise.resolve(relativePath),
  },
  files: {
    readText: () => Promise.resolve(""),
    exists: () => Promise.resolve(false),
    directoryExists: () => Promise.resolve(null),
    pickFile: () => Promise.resolve(null),
    pickDirectory: () => Promise.resolve(null),
  },
  generator: null,
  actions: {
    openSettings: (tab) => {
      if (GUEST_WORKBENCH_ENABLED) {
        window.dispatchEvent(
          new CustomEvent(OPEN_GUEST_SETTINGS_EVENT, { detail: { tab } })
        );
      }
    },
    openLink: (url) => window.open(url, "_blank", "noopener,noreferrer"),
    shareThread: () => {
      if (GUEST_WORKBENCH_ENABLED) {
        window.alert("游客 Thread 分享即将开放。");
      }
    },
    openVariables: (variableName) => openVariablesBridge.open(variableName),
    registerOpenVariables: (handler) =>
      openVariablesBridge.register(handler),
    registerRunThread: () => () => {
      /* nothing to unregister */
    },
  },
};

export const webModelClient: ModelClient = {
  availableModels: _availableGuestModels,
  builtinProviders: _availableGuestModels,
  getDefaultModel: () => {
    if (!GUEST_WORKBENCH_ENABLED) return Promise.resolve(null);
    const stored = readLocalStorage(LOCAL_STORAGE_KEYS.guestDefaultModel);
    if (stored) {
      const separator = stored.indexOf(":");
      if (separator > 0) {
        const storedModel = {
          provider: stored.slice(0, separator),
          id: stored.slice(separator + 1),
        };
        if (isGuestModelConfigAvailable(storedModel)) {
          return Promise.resolve(storedModel);
        }
        removeLocalStorage(LOCAL_STORAGE_KEYS.guestDefaultModel);
      }
    }
    return Promise.resolve({
      provider: GUEST_PROVIDER_ID,
      id: GUEST_MODEL_ID,
    });
  },
  setDefaultModel: (model) => {
    if (!GUEST_WORKBENCH_ENABLED || !model) {
      removeLocalStorage(LOCAL_STORAGE_KEYS.guestDefaultModel);
      return Promise.resolve(
        GUEST_WORKBENCH_ENABLED
          ? { provider: GUEST_PROVIDER_ID, id: GUEST_MODEL_ID }
          : null
      );
    }
    if (!isGuestModelConfigAvailable(model)) {
      removeLocalStorage(LOCAL_STORAGE_KEYS.guestDefaultModel);
      return Promise.resolve({
        provider: GUEST_PROVIDER_ID,
        id: GUEST_MODEL_ID,
      });
    }
    writeLocalStorage(
      LOCAL_STORAGE_KEYS.guestDefaultModel,
      `${model.provider}:${model.id}`
    );
    return Promise.resolve({ provider: model.provider, id: model.id });
  },
  removeProvider: _availableGuestModels,
  addProvider: _availableGuestModels,
  addCustomProvider: _availableGuestModels,
  updateProvider: _availableGuestModels,
  setModelEnabled: _availableGuestModels,
  setAllModelsEnabled: _availableGuestModels,
  testModelConnection: () => Promise.resolve(),
  removeCustomModel: _availableGuestModels,
  upsertCustomModel: _availableGuestModels,
};

async function _availableGuestModels() {
  if (!GUEST_WORKBENCH_ENABLED) return [];
  try {
    return (await readGuestModels()).providers;
  } catch (error) {
    console.warn("无法刷新智谱模型列表，暂时使用默认模型。", error);
    return [GUEST_FALLBACK_PROVIDER];
  }
}
