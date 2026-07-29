import type { HostServices, ModelClient } from "@llm-space/ui/host";

import { GUEST_MODEL_ID, GUEST_PROVIDER } from "@/guest/guest-api";

export const GUEST_WORKBENCH_ENABLED =
  import.meta.env.VITE_GUEST_WORKBENCH === "1";

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
  executeTool: null,
  skills: {
    getSettings: () => Promise.resolve({ discoveryPaths: [] }),
    listSkills: () => Promise.resolve([]),
  },
  mcp: {
    listServers: () => Promise.resolve([]),
    listTools: () => unavailable(),
  },
  builtinTools: {
    list: () => Promise.resolve([]),
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
    openSettings: () => {
      if (GUEST_WORKBENCH_ENABLED) {
        window.alert("BYOK 设置即将开放。");
      }
    },
    openLink: (url) => window.open(url, "_blank", "noopener,noreferrer"),
    shareThread: () => {
      if (GUEST_WORKBENCH_ENABLED) {
        window.alert("游客 Thread 分享即将开放。");
      }
    },
    openVariables: () => {
      /* registered by the active playground */
    },
    registerOpenVariables: () => () => {
      /* nothing to unregister */
    },
    registerRunThread: () => () => {
      /* nothing to unregister */
    },
  },
};

export const webModelClient: ModelClient = {
  availableModels: () =>
    Promise.resolve(GUEST_WORKBENCH_ENABLED ? [GUEST_PROVIDER] : []),
  builtinProviders: () =>
    Promise.resolve(GUEST_WORKBENCH_ENABLED ? [GUEST_PROVIDER] : []),
  getDefaultModel: () =>
    Promise.resolve(
      GUEST_WORKBENCH_ENABLED
        ? { provider: GUEST_PROVIDER.id, id: GUEST_MODEL_ID }
        : null
    ),
  setDefaultModel: () => Promise.resolve(null),
  removeProvider: () =>
    Promise.resolve(GUEST_WORKBENCH_ENABLED ? [GUEST_PROVIDER] : []),
  addProvider: () =>
    Promise.resolve(GUEST_WORKBENCH_ENABLED ? [GUEST_PROVIDER] : []),
  addCustomProvider: () =>
    Promise.resolve(GUEST_WORKBENCH_ENABLED ? [GUEST_PROVIDER] : []),
  updateProvider: () =>
    Promise.resolve(GUEST_WORKBENCH_ENABLED ? [GUEST_PROVIDER] : []),
  setModelEnabled: () =>
    Promise.resolve(GUEST_WORKBENCH_ENABLED ? [GUEST_PROVIDER] : []),
  setAllModelsEnabled: () =>
    Promise.resolve(GUEST_WORKBENCH_ENABLED ? [GUEST_PROVIDER] : []),
  testModelConnection: () => Promise.resolve(),
  removeCustomModel: () =>
    Promise.resolve(GUEST_WORKBENCH_ENABLED ? [GUEST_PROVIDER] : []),
  upsertCustomModel: () =>
    Promise.resolve(GUEST_WORKBENCH_ENABLED ? [GUEST_PROVIDER] : []),
};
