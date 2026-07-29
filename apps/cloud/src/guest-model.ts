import {
  createModels,
  createProvider,
  envApiKeyAuth,
  type Model,
} from "@earendil-works/pi-ai";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";
import { streamAgent } from "@llm-space/core/server";
import type { AgentStreamRequest } from "@llm-space/core/types";

export const GUEST_PROVIDER_ID = "bigmodel";
export const DEFAULT_GUEST_MODEL_ID = "glm-4.7-flash";
export const BIGMODEL_BASE_URL =
  "https://open.bigmodel.cn/api/paas/v4";

export function createGuestModelExecutor(options: {
  apiKey: string;
  modelId: string;
  maxOutputTokens: number;
}) {
  const model: Model<"openai-completions"> = {
    id: options.modelId,
    name: "GLM-4.7-Flash",
    api: "openai-completions",
    provider: GUEST_PROVIDER_ID,
    baseUrl: BIGMODEL_BASE_URL,
    reasoning: true,
    thinkingLevelMap: {
      off: "disabled",
      minimal: "enabled",
      low: "enabled",
      medium: "enabled",
      high: "enabled",
    },
    input: ["text"],
    cost: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
    },
    contextWindow: 200_000,
    maxTokens: options.maxOutputTokens,
    compat: {
      supportsStore: false,
      supportsDeveloperRole: false,
      supportsReasoningEffort: false,
      supportsUsageInStreaming: true,
      maxTokensField: "max_tokens",
      thinkingFormat: "zai",
    },
  };
  const provider = createProvider({
    id: GUEST_PROVIDER_ID,
    name: "智谱 BigModel",
    baseUrl: BIGMODEL_BASE_URL,
    auth: {
      apiKey: envApiKeyAuth("Zhipu API key", ["ZHIPU_API_KEY"]),
    },
    models: [model],
    api: openAICompletionsApi(),
  });
  const models = createModels();
  models.setProvider(provider);

  return (request: AgentStreamRequest, signal: AbortSignal) =>
    streamAgent(
      {
        ...request,
        model: {
          provider: GUEST_PROVIDER_ID,
          id: options.modelId,
        },
        config: {
          model: {
            maxTokens: options.maxOutputTokens,
            reasoning: "off",
            temperature: _safeTemperature(
              request.config?.model?.temperature
            ),
          },
        },
      },
      {
        models,
        signal,
        getApiKey: () => options.apiKey,
      }
    );
}

function _safeTemperature(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0.7;
  return Math.min(1, Math.max(0, value));
}
