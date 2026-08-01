import {
  createModels,
  createProvider,
  envApiKeyAuth,
} from "@earendil-works/pi-ai";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";
import { streamAgent } from "@llm-space/core/server";
import type { AgentStreamRequest } from "@llm-space/core/types";

import {
  BIGMODEL_BASE_URL,
  createGuestModels,
  GUEST_PROVIDER_ID,
  isGuestModelAllowed,
} from "./guest-model-catalog";

export function createGuestModelExecutor(options: {
  apiKey: string;
  modelId: string;
  maxOutputTokens: number;
}) {
  if (!isGuestModelAllowed(options.modelId)) {
    throw new Error(`GUEST_MODEL_ID is not allowed: ${options.modelId}`);
  }
  const models = createGuestModels(options.maxOutputTokens);
  const provider = createProvider({
    id: GUEST_PROVIDER_ID,
    name: "智谱 BigModel",
    baseUrl: BIGMODEL_BASE_URL,
    auth: {
      apiKey: envApiKeyAuth("Zhipu API key", ["ZHIPU_API_KEY"]),
    },
    models,
    api: openAICompletionsApi(),
  });
  const modelRegistry = createModels();
  modelRegistry.setProvider(provider);

  return (request: AgentStreamRequest, signal: AbortSignal) => {
    const selectedModel = request.model?.id ?? options.modelId;
    if (
      request.model?.provider !== GUEST_PROVIDER_ID ||
      !isGuestModelAllowed(selectedModel)
    ) {
      throw new Error("Guest model is not allowed.");
    }
    return streamAgent(
      {
        ...request,
        model: {
          provider: GUEST_PROVIDER_ID,
          id: selectedModel,
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
        models: modelRegistry,
        signal,
        getApiKey: () => options.apiKey,
      }
    );
  };
}

function _safeTemperature(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0.7;
  return Math.min(1, Math.max(0, value));
}
