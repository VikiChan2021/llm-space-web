import type { Model } from "@earendil-works/pi-ai";
import type { ModelProviderGroup } from "@llm-space/core";

export const GUEST_PROVIDER_ID = "bigmodel";
export const DEFAULT_GUEST_MODEL_ID = "glm-4.7-flash";
export const BIGMODEL_BASE_URL =
  "https://open.bigmodel.cn/api/paas/v4";

interface GuestModelCatalogEntry {
  id: string;
  name: string;
  contextWindow: number;
  reasoning: boolean;
}

/**
 * Models documented by Zhipu as text/chat models on 2026-08-01. Vision,
 * image, video, embedding and audio models intentionally stay out of the
 * text-only guest Thread runtime.
 */
export const GUEST_MODEL_CATALOG: readonly GuestModelCatalogEntry[] = [
  {
    id: DEFAULT_GUEST_MODEL_ID,
    name: "GLM-4.7-Flash（推荐）",
    contextWindow: 200_000,
    reasoning: true,
  },
  {
    id: "glm-4-flash-250414",
    name: "GLM-4-Flash-250414（免费）",
    contextWindow: 128_000,
    reasoning: false,
  },
  { id: "glm-4.5", name: "GLM-4.5", contextWindow: 128_000, reasoning: true },
  { id: "glm-4.6", name: "GLM-4.6", contextWindow: 200_000, reasoning: true },
  { id: "glm-4.7", name: "GLM-4.7", contextWindow: 200_000, reasoning: true },
  { id: "glm-5", name: "GLM-5", contextWindow: 200_000, reasoning: true },
  {
    id: "glm-5-turbo",
    name: "GLM-5-Turbo",
    contextWindow: 200_000,
    reasoning: true,
  },
  { id: "glm-5.1", name: "GLM-5.1", contextWindow: 200_000, reasoning: true },
  { id: "glm-5.2", name: "GLM-5.2", contextWindow: 200_000, reasoning: true },
];

const GUEST_MODEL_IDS = new Set(GUEST_MODEL_CATALOG.map((model) => model.id));

export function isGuestModelAllowed(modelId: string): boolean {
  return GUEST_MODEL_IDS.has(modelId);
}

export function createGuestModels(
  maxOutputTokens: number
): Model<"openai-completions">[] {
  return GUEST_MODEL_CATALOG.map((model) => ({
    id: model.id,
    name: model.name,
    api: "openai-completions",
    provider: GUEST_PROVIDER_ID,
    baseUrl: BIGMODEL_BASE_URL,
    reasoning: model.reasoning,
    ...(model.reasoning
      ? {
          thinkingLevelMap: {
            off: "disabled",
            minimal: "enabled",
            low: "enabled",
            medium: "enabled",
            high: "enabled",
          } as const,
        }
      : {}),
    input: ["text"],
    cost: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
    },
    contextWindow: model.contextWindow,
    maxTokens: maxOutputTokens,
    compat: {
      supportsStore: false,
      supportsDeveloperRole: false,
      supportsReasoningEffort: false,
      supportsUsageInStreaming: true,
      maxTokensField: "max_tokens",
      thinkingFormat: "zai",
    },
  }));
}

export function createGuestModelProvider(
  maxOutputTokens: number
): ModelProviderGroup {
  return {
    id: GUEST_PROVIDER_ID,
    name: "智谱 BigModel",
    builtin: true,
    apiKeyDetected: true,
    models: createGuestModels(maxOutputTokens),
  };
}
