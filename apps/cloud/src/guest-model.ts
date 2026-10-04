import {
  createModels,
  createProvider,
  envApiKeyAuth,
} from "@earendil-works/pi-ai";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";
import { streamAgent } from "@llm-space/core/server";
import type { AgentStreamRequest } from "@llm-space/core/types";

import {
  createGuestModels,
  GUEST_PROVIDER_ID,
  GUEST_PROVIDER_DEFINITIONS,
  isGuestModelAllowed,
  isGuestProviderId,
  type GuestProviderApiKeys,
  type GuestProviderId,
} from "./guest-model-catalog";

export function createGuestModelExecutor(options: {
  apiKey: string;
  providerId?: GuestProviderId;
  providerApiKeys?: GuestProviderApiKeys;
  modelId: string;
  maxOutputTokens: number;
}) {
  const defaultProvider = options.providerId ?? GUEST_PROVIDER_ID;
  const apiKeys = options.providerApiKeys ?? {
    [defaultProvider]: options.apiKey,
  };
  if (!isGuestModelAllowed(options.modelId, defaultProvider)) {
    throw new Error(`GUEST_MODEL_ID is not allowed: ${options.modelId}`);
  }
  const modelRegistry = createModels();
  for (const [id, key] of Object.entries(apiKeys)) {
    if (!key || !isGuestProviderId(id)) continue;
    const definition = GUEST_PROVIDER_DEFINITIONS[id];
    const provider = createProvider({
      id,
      name: definition.name,
      baseUrl: definition.baseUrl,
      auth: {
        apiKey: envApiKeyAuth("Guest server API key", [
          definition.keyEnvironment,
        ]),
      },
      models: createGuestModels(options.maxOutputTokens, id),
      api: openAICompletionsApi(),
    });
    modelRegistry.setProvider(provider);
  }

  return (request: AgentStreamRequest, signal: AbortSignal) => {
    const selectedModel = request.model?.id ?? options.modelId;
    const selectedProvider = request.model?.provider ?? defaultProvider;
    if (
      !isGuestProviderId(selectedProvider) ||
      !apiKeys[selectedProvider] ||
      !isGuestModelAllowed(selectedModel, selectedProvider)
    ) {
      throw new Error("Guest model is not allowed.");
    }
    return streamAgent(
      {
        ...request,
        model: {
          provider: selectedProvider,
          id: selectedModel,
        },
        config: {
          model: {
            maxTokens: options.maxOutputTokens,
            reasoning: "off",
            temperature: _safeTemperature(request.config?.model?.temperature),
          },
        },
      },
      {
        models: modelRegistry,
        signal,
        getApiKey: (provider) =>
          isGuestProviderId(provider) ? apiKeys[provider] : undefined,
      }
    );
  };
}

function _safeTemperature(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0.7;
  return Math.min(1, Math.max(0, value));
}
