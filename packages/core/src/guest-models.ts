import type { Model } from "@earendil-works/pi-ai";

import type { ModelProviderGroup } from "./types";

// Browser-safe metadata only. Credentials and enabled-provider policy belong
// to the guest server; a client entry never grants execution permission.
export const GUEST_PROVIDER_DEFINITIONS = {
  bigmodel: {
    name: "智谱 BigModel",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    keyEnvironment: "ZHIPU_API_KEY",
    defaultModelId: "glm-4.5-air",
  },
  siliconflow: {
    name: "硅基流动 · 免费模型",
    baseUrl: "https://api.siliconflow.cn/v1",
    keyEnvironment: "SILICONFLOW_API_KEY",
    defaultModelId: "Qwen/Qwen3-8B",
  },
  openrouter: {
    name: "OpenRouter · 免费模型",
    baseUrl: "https://openrouter.ai/api/v1",
    keyEnvironment: "OPENROUTER_API_KEY",
    defaultModelId: "openrouter/free",
  },
} as const;

export type GuestProviderId = keyof typeof GUEST_PROVIDER_DEFINITIONS;
export type GuestProviderApiKeys = Partial<Record<GuestProviderId, string>>;
export const DEFAULT_FREE_GUEST_PROVIDER: GuestProviderId = "siliconflow";
export const DEFAULT_FREE_GUEST_MODEL_ID = "Qwen/Qwen3-8B";

interface GuestModelEntry {
  id: string;
  name: string;
  provider: GuestProviderId;
  contextWindow: number;
  reasoning: boolean;
  input: readonly ("text" | "image")[];
}

export const GUEST_MODEL_CATALOG: readonly GuestModelEntry[] = [
  {
    id: "glm-4.5-air",
    name: "GLM-4.5-Air",
    provider: "bigmodel",
    contextWindow: 128_000,
    reasoning: true,
    input: ["text"],
  },
  {
    id: "glm-4.7",
    name: "GLM-4.7",
    provider: "bigmodel",
    contextWindow: 200_000,
    reasoning: true,
    input: ["text"],
  },
  {
    id: "glm-4.6v",
    name: "GLM-4.6V",
    provider: "bigmodel",
    contextWindow: 128_000,
    reasoning: true,
    input: ["text", "image"],
  },
  {
    id: DEFAULT_FREE_GUEST_MODEL_ID,
    name: "Qwen3-8B（免费）",
    provider: "siliconflow",
    contextWindow: 131_072,
    reasoning: true,
    input: ["text"],
  },
  {
    id: "openrouter/free",
    name: "免费自动路由（模型可能变化）",
    provider: "openrouter",
    contextWindow: 200_000,
    reasoning: true,
    input: ["text"],
  },
  {
    id: "qwen/qwen3.8-27b:free",
    name: "Qwen3.8-27B（免费）",
    provider: "openrouter",
    contextWindow: 262_144,
    reasoning: true,
    input: ["text"],
  },
];

export function isGuestProviderId(value: string): value is GuestProviderId {
  return Object.hasOwn(GUEST_PROVIDER_DEFINITIONS, value);
}

export function findGuestModel(modelId: string, provider?: string) {
  return GUEST_MODEL_CATALOG.find(
    (model) =>
      model.id === modelId && (!provider || model.provider === provider)
  );
}

export function isGuestModelAllowed(
  modelId: string,
  provider?: string
): boolean {
  return Boolean(findGuestModel(modelId, provider));
}

export function createGuestModels(
  maxOutputTokens: number,
  provider: GuestProviderId = "bigmodel"
): Model<"openai-completions">[] {
  return GUEST_MODEL_CATALOG.filter((model) => model.provider === provider).map(
    (model) => ({
      id: model.id,
      name: model.name,
      api: "openai-completions",
      provider,
      baseUrl: GUEST_PROVIDER_DEFINITIONS[provider].baseUrl,
      reasoning: model.reasoning,
      input: [...model.input],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: model.contextWindow,
      maxTokens: maxOutputTokens,
      compat: {
        supportsStore: false,
        supportsDeveloperRole: false,
        supportsReasoningEffort: provider === "openrouter",
        supportsUsageInStreaming: true,
        maxTokensField: "max_tokens",
        ...(provider === "bigmodel" ? { thinkingFormat: "zai" as const } : {}),
        ...(provider === "siliconflow"
          ? { thinkingFormat: "qwen" as const }
          : {}),
        ...(provider === "openrouter"
          ? { thinkingFormat: "openrouter" as const }
          : {}),
      },
    })
  );
}

export function createGuestModelProvider(
  maxOutputTokens: number,
  provider: GuestProviderId = "bigmodel"
): ModelProviderGroup {
  return {
    id: provider,
    name: GUEST_PROVIDER_DEFINITIONS[provider].name,
    builtin: true,
    apiKeyDetected: true,
    profiles: [{ id: "guest-default", name: "游客服务器 Key" }],
    models: createGuestModels(maxOutputTokens, provider),
  };
}
