import { describe, expect, test } from "bun:test";

import { loadGuestCloudConfig } from "./guest-config";

const BASE_ENV = {
  GUEST_PUBLIC_URL: "http://127.0.0.1:5175/llm-space-web/",
  GUEST_HMAC_SECRET: "h".repeat(32),
  ZHIPU_API_KEY: "test-only-key",
};

describe("guest cloud config", () => {
  test("can hide an exhausted provider without deleting its server credential", () => {
    const config = loadGuestCloudConfig({
      ...BASE_ENV,
      SILICONFLOW_API_KEY: "silicon-test-key",
      GUEST_ENABLED_PROVIDERS: "siliconflow",
    });
    expect(config.providerApiKeys).toEqual({ siliconflow: "silicon-test-key" });
    expect(config.providerId).toBe("siliconflow");
  });
  test("loads free providers without requiring Zhipu and selects the matching server key", () => {
    const config = loadGuestCloudConfig({
      GUEST_PUBLIC_URL: BASE_ENV.GUEST_PUBLIC_URL,
      GUEST_HMAC_SECRET: BASE_ENV.GUEST_HMAC_SECRET,
      SILICONFLOW_API_KEY: "silicon-test-key",
      OPENROUTER_API_KEY: "router-test-key",
    });
    expect(config.providerId).toBe("siliconflow");
    expect(config.modelId).toBe("Qwen/Qwen3-8B");
    expect(config.apiKey).toBe("silicon-test-key");
    const router = loadGuestCloudConfig({
      GUEST_PUBLIC_URL: BASE_ENV.GUEST_PUBLIC_URL,
      GUEST_HMAC_SECRET: BASE_ENV.GUEST_HMAC_SECRET,
      OPENROUTER_API_KEY: "router-test-key",
      GUEST_PROVIDER: "openrouter",
    });
    expect(router.modelId).toBe("openrouter/free");
    expect(router.apiKey).toBe("router-test-key");
  });

  test("rejects paid model IDs, forged providers, and providers without credentials", () => {
    const env = {
      ...BASE_ENV,
      OPENROUTER_API_KEY: "router-test-key",
      GUEST_PROVIDER: "openrouter",
    };
    expect(() =>
      loadGuestCloudConfig({ ...env, GUEST_MODEL_ID: "openrouter/auto" })
    ).toThrow("free model allowlist");
    expect(() =>
      loadGuestCloudConfig({
        ...env,
        GUEST_PROVIDER: "https://attacker.invalid",
      })
    ).toThrow("GUEST_PROVIDER");
    expect(() =>
      loadGuestCloudConfig({ ...BASE_ENV, GUEST_PROVIDER: "siliconflow" })
    ).toThrow("SILICONFLOW_API_KEY");
  });

  test("loads bounded defaults without exposing the API key elsewhere", () => {
    const config = loadGuestCloudConfig(BASE_ENV);

    expect(config.port).toBe(8791);
    expect(config.browserDailyLimit).toBe(20);
    expect(config.ipDailyLimit).toBe(100);
    expect(config.maxConcurrentPerGuest).toBe(1);
    expect(config.maxOutputTokens).toBe(2048);
    expect(config.maxRequestBytes).toBe(10 * 1024 * 1024);
    expect(config.maxImages).toBe(5);
    expect(config.maxImageBytes).toBe(4 * 1024 * 1024);
    expect(config.maxTotalImageBytes).toBe(6 * 1024 * 1024);
    expect(config.modelId).toBe("glm-4.5-air");
    expect(config.remoteMcpEnabled).toBe(false);
    expect(config.secureCookies).toBe(false);
    expect(config.apiKey).toBe("test-only-key");
  });

  test("旧版或无效模型环境变量会迁移到新默认模型", () => {
    expect(
      loadGuestCloudConfig({
        ...BASE_ENV,
        GUEST_MODEL_ID: "glm-4.7-flash",
      }).modelId
    ).toBe("glm-4.5-air");
  });

  test("允许在三款已验证模型中配置服务端默认值", () => {
    expect(
      loadGuestCloudConfig({ ...BASE_ENV, GUEST_MODEL_ID: "glm-4.7" }).modelId
    ).toBe("glm-4.7");
  });

  test("only enables public remote MCP through an explicit production flag", () => {
    expect(
      loadGuestCloudConfig({
        ...BASE_ENV,
        GUEST_REMOTE_MCP_ENABLED: "1",
      }).remoteMcpEnabled
    ).toBe(true);
  });

  test("requires a sufficiently long HMAC secret", () => {
    expect(() =>
      loadGuestCloudConfig({ ...BASE_ENV, GUEST_HMAC_SECRET: "short" })
    ).toThrow("at least 32 bytes");
  });

  test("rejects unsafe quota values", () => {
    expect(() =>
      loadGuestCloudConfig({
        ...BASE_ENV,
        GUEST_BROWSER_DAILY_LIMIT: "0",
      })
    ).toThrow("GUEST_BROWSER_DAILY_LIMIT");
  });
});
