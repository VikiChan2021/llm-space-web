import {
  DEFAULT_GUEST_MODEL_ID,
  isGuestModelAllowed,
} from "./guest-model-catalog";

export interface GuestCloudConfig {
  host: string;
  port: number;
  publicUrl: URL;
  apiKey: string;
  modelId: string;
  quotaDatabasePath: string;
  hmacSecret: string;
  browserDailyLimit: number;
  ipDailyLimit: number;
  maxConcurrentPerGuest: number;
  maxRequestBytes: number;
  maxTextCharacters: number;
  maxOutputTokens: number;
  remoteMcpEnabled: boolean;
  trustProxy: boolean;
  secureCookies: boolean;
}

export function loadGuestCloudConfig(
  environment: Record<string, string | undefined> = process.env
): GuestCloudConfig {
  const publicUrl = _readUrl(
    environment.GUEST_PUBLIC_URL,
    "GUEST_PUBLIC_URL"
  );
  const hmacSecret = _required(
    environment.GUEST_HMAC_SECRET,
    "GUEST_HMAC_SECRET"
  );
  if (Buffer.byteLength(hmacSecret, "utf8") < 32) {
    throw new Error("GUEST_HMAC_SECRET must be at least 32 bytes.");
  }
  const requestedModelId = environment.GUEST_MODEL_ID?.trim();
  const modelId =
    requestedModelId && isGuestModelAllowed(requestedModelId)
      ? requestedModelId
      : DEFAULT_GUEST_MODEL_ID;

  return {
    host: environment.GUEST_HOST?.trim() || "127.0.0.1",
    port: _readInteger(
      environment.GUEST_PORT,
      "GUEST_PORT",
      8791,
      1,
      65_535
    ),
    publicUrl,
    apiKey: _required(environment.ZHIPU_API_KEY, "ZHIPU_API_KEY"),
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
      128 * 1024,
      1024,
      1024 * 1024
    ),
    maxTextCharacters: _readInteger(
      environment.GUEST_MAX_TEXT_CHARACTERS,
      "GUEST_MAX_TEXT_CHARACTERS",
      12_000,
      100,
      200_000
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
