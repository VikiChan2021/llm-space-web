import {
  DEFAULT_GUEST_MODEL_ID,
  GUEST_PROVIDER_DEFINITIONS,
  isGuestModelAllowed,
  isGuestProviderId,
  type GuestProviderApiKeys,
  type GuestProviderId,
} from "./guest-model-catalog";

export interface GuestCloudConfig {
  host: string;
  port: number;
  publicUrl: URL;
  apiKey: string;
  providerId?: GuestProviderId;
  providerApiKeys?: GuestProviderApiKeys;
  modelId: string;
  quotaDatabasePath: string;
  hmacSecret: string;
  browserDailyLimit: number;
  ipDailyLimit: number;
  maxConcurrentPerGuest: number;
  maxRequestBytes: number;
  maxTextCharacters: number;
  maxImages: number;
  maxImageBytes: number;
  maxTotalImageBytes: number;
  maxOutputTokens: number;
  remoteMcpEnabled: boolean;
  trustProxy: boolean;
  secureCookies: boolean;
}

export function loadGuestCloudConfig(
  environment: Record<string, string | undefined> = process.env
): GuestCloudConfig {
  const publicUrl = _readUrl(environment.GUEST_PUBLIC_URL, "GUEST_PUBLIC_URL");
  const hmacSecret = _required(
    environment.GUEST_HMAC_SECRET,
    "GUEST_HMAC_SECRET"
  );
  if (Buffer.byteLength(hmacSecret, "utf8") < 32) {
    throw new Error("GUEST_HMAC_SECRET must be at least 32 bytes.");
  }
  const providerApiKeys: GuestProviderApiKeys = {};
  const enabledProviders = environment.GUEST_ENABLED_PROVIDERS?.split(",").map(
    (provider) => provider.trim()
  );
  if (enabledProviders?.some((provider) => !isGuestProviderId(provider))) {
    throw new Error("GUEST_ENABLED_PROVIDERS contains an unknown provider.");
  }
  for (const [id, definition] of Object.entries(GUEST_PROVIDER_DEFINITIONS)) {
    if (enabledProviders && !enabledProviders.includes(id)) continue;
    const key = environment[definition.keyEnvironment]?.trim();
    if (key) providerApiKeys[id as GuestProviderId] = key;
  }
  const requestedProvider = environment.GUEST_PROVIDER?.trim();
  if (requestedProvider && !isGuestProviderId(requestedProvider)) {
    throw new Error("GUEST_PROVIDER is not allowed.");
  }
  const providerId: GuestProviderId =
    (requestedProvider as GuestProviderId) ||
    (providerApiKeys.siliconflow
      ? "siliconflow"
      : providerApiKeys.openrouter
        ? "openrouter"
        : "bigmodel");
  const apiKey = _required(
    providerApiKeys[providerId],
    GUEST_PROVIDER_DEFINITIONS[providerId].keyEnvironment
  );
  const requestedModelId = environment.GUEST_MODEL_ID?.trim();
  if (
    requestedModelId &&
    providerId !== "bigmodel" &&
    !isGuestModelAllowed(requestedModelId, providerId)
  ) {
    throw new Error(
      "GUEST_MODEL_ID is not in the free model allowlist for GUEST_PROVIDER."
    );
  }
  const modelId =
    requestedModelId && isGuestModelAllowed(requestedModelId, providerId)
      ? requestedModelId
      : providerId === "bigmodel"
        ? DEFAULT_GUEST_MODEL_ID
        : GUEST_PROVIDER_DEFINITIONS[providerId].defaultModelId;

  return {
    host: environment.GUEST_HOST?.trim() || "127.0.0.1",
    port: _readInteger(environment.GUEST_PORT, "GUEST_PORT", 8791, 1, 65_535),
    publicUrl,
    apiKey,
    providerId,
    providerApiKeys,
    modelId,
    quotaDatabasePath:
      environment.GUEST_QUOTA_DATABASE_PATH?.trim() ||
      "./data/guest-quota.sqlite",
    hmacSecret,
    browserDailyLimit: _readInteger(
      environment.GUEST_BROWSER_DAILY_LIMIT,
      "GUEST_BROWSER_DAILY_LIMIT",
      20,
      1,
      10_000
    ),
    ipDailyLimit: _readInteger(
      environment.GUEST_IP_DAILY_LIMIT,
      "GUEST_IP_DAILY_LIMIT",
      100,
      1,
      100_000
    ),
    maxConcurrentPerGuest: _readInteger(
      environment.GUEST_MAX_CONCURRENT,
      "GUEST_MAX_CONCURRENT",
      1,
      1,
      10
    ),
    maxRequestBytes: _readInteger(
      environment.GUEST_MAX_REQUEST_BYTES,
      "GUEST_MAX_REQUEST_BYTES",
      10 * 1024 * 1024,
      1024,
      16 * 1024 * 1024
    ),
    maxTextCharacters: _readInteger(
      environment.GUEST_MAX_TEXT_CHARACTERS,
      "GUEST_MAX_TEXT_CHARACTERS",
      12_000,
      100,
      200_000
    ),
    maxImages: _readInteger(
      environment.GUEST_MAX_IMAGES,
      "GUEST_MAX_IMAGES",
      5,
      1,
      10
    ),
    maxImageBytes: _readInteger(
      environment.GUEST_MAX_IMAGE_BYTES,
      "GUEST_MAX_IMAGE_BYTES",
      4 * 1024 * 1024,
      64 * 1024,
      8 * 1024 * 1024
    ),
    maxTotalImageBytes: _readInteger(
      environment.GUEST_MAX_TOTAL_IMAGE_BYTES,
      "GUEST_MAX_TOTAL_IMAGE_BYTES",
      6 * 1024 * 1024,
      64 * 1024,
      12 * 1024 * 1024
    ),
    maxOutputTokens: _readInteger(
      environment.GUEST_MAX_OUTPUT_TOKENS,
      "GUEST_MAX_OUTPUT_TOKENS",
      2048,
      16,
      16_384
    ),
    remoteMcpEnabled: environment.GUEST_REMOTE_MCP_ENABLED === "1",
    trustProxy: environment.GUEST_TRUST_PROXY === "1",
    secureCookies: publicUrl.protocol === "https:",
  };
}

export function getGuestProviderApiKeys(
  config: Pick<GuestCloudConfig, "apiKey" | "providerId" | "providerApiKeys">
): GuestProviderApiKeys {
  return (
    config.providerApiKeys ?? {
      [config.providerId ?? "bigmodel"]: config.apiKey,
    }
  );
}

export function isConfiguredGuestModel(
  config: GuestCloudConfig,
  provider: string,
  modelId: string
): boolean {
  return (
    isGuestProviderId(provider) &&
    Boolean(getGuestProviderApiKeys(config)[provider]) &&
    isGuestModelAllowed(modelId, provider)
  );
}

function _required(value: string | undefined, name: string): string {
  const trimmed = value?.trim();
  if (!trimmed) throw new Error(`${name} is required.`);
  return trimmed;
}

function _readUrl(value: string | undefined, name: string): URL {
  const parsed = new URL(_required(value, name));
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`${name} must use http or https.`);
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error(`${name} must not include credentials, query, or hash.`);
  }
  return parsed;
}

function _readInteger(
  value: string | undefined,
  name: string,
  fallback: number,
  minimum: number,
  maximum: number
): number {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(
      `${name} must be an integer from ${minimum} to ${maximum}.`
    );
  }
  return parsed;
}
