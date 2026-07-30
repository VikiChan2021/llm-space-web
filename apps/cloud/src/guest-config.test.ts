import { describe, expect, test } from "bun:test";

import { loadGuestCloudConfig } from "./guest-config";

const BASE_ENV = {
  GUEST_PUBLIC_URL: "http://127.0.0.1:5175/llm-space-web/",
  GUEST_HMAC_SECRET: "h".repeat(32),
  ZHIPU_API_KEY: "test-only-key",
};

describe("guest cloud config", () => {
  test("loads bounded defaults without exposing the API key elsewhere", () => {
    const config = loadGuestCloudConfig(BASE_ENV);

    expect(config.port).toBe(8791);
    expect(config.browserDailyLimit).toBe(20);
    expect(config.ipDailyLimit).toBe(100);
    expect(config.maxConcurrentPerGuest).toBe(1);
    expect(config.maxOutputTokens).toBe(2048);
    expect(config.remoteMcpEnabled).toBe(false);
    expect(config.secureCookies).toBe(false);
    expect(config.apiKey).toBe("test-only-key");
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
