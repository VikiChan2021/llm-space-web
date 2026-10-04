import { describe, expect, test } from "bun:test";

import {
  GUEST_FALLBACK_PROVIDER,
  acceptGuestModels,
  GUEST_MODEL_ID,
  GuestRunError,
  isGuestModelConfigAvailable,
  joinGuestApiUrl,
  parseGuestStreamData,
  readGuestRunError,
} from "./guest-api";

describe("游客 Run 结构化错误", () => {
  test("rejects unlisted paid models and a forged provider in the public catalog", () => {
    expect(() =>
      acceptGuestModels({
        defaultModel: { provider: "siliconflow", id: "paid-model" },
        providers: [
          {
            ...GUEST_FALLBACK_PROVIDER,
            models: [
              { ...GUEST_FALLBACK_PROVIDER.models[0], id: "paid-model" },
            ],
          },
        ],
      })
    ).toThrow("格式无效");
    expect(() =>
      acceptGuestModels({
        defaultModel: { provider: "attacker", id: "Qwen/Qwen3-8B" },
        providers: [{ ...GUEST_FALLBACK_PROVIDER, id: "attacker" }],
      })
    ).toThrow("格式无效");
  });
  test("离线回退默认使用白名单免费模型", () => {
    acceptGuestModels({
      defaultModel: { provider: "siliconflow", id: "Qwen/Qwen3-8B" },
      providers: [GUEST_FALLBACK_PROVIDER],
    });
    expect(GUEST_MODEL_ID).toBe("Qwen/Qwen3-8B");
    expect(GUEST_FALLBACK_PROVIDER.models.map((model) => model.id)).toEqual([
      "Qwen/Qwen3-8B",
    ]);
    expect(
      isGuestModelConfigAvailable({
        provider: "siliconflow",
        id: "Qwen/Qwen3-8B",
      })
    ).toBe(true);
    expect(
      isGuestModelConfigAvailable({
        provider: "bigmodel",
        id: "glm-4.7-flash",
      })
    ).toBe(false);
  });

  test("API 地址只保留一个路径分隔符", () => {
    expect(joinGuestApiUrl("/llm-space-web/", "/api/guest/mcp/call")).toBe(
      "/llm-space-web/api/guest/mcp/call"
    );
    expect(joinGuestApiUrl("/", "api/guest/runs")).toBe("/api/guest/runs");
  });

  test("保留安全错误码、状态、请求编号和额度", async () => {
    const response = new Response(
      JSON.stringify({
        error: {
          code: "guest_daily_limit",
          message: "今日免费体验额度已用完。",
          requestId: "request-body",
        },
        quota: {
          model: "glm-4.5-air",
          browserDailyLimit: 20,
          browserRemaining: 0,
          ipRemaining: 0,
          resetsAt: "2026-07-31T00:00:00.000Z",
          byokAvailable: false,
        },
      }),
      {
        status: 429,
        headers: { "X-Request-Id": "request-header" },
      }
    );

    const error = await readGuestRunError(response);

    expect(error).toBeInstanceOf(GuestRunError);
    expect(error).toMatchObject({
      code: "guest_daily_limit",
      status: 429,
      requestId: "request-body",
      quota: { browserRemaining: 0 },
    });
  });

  test("无效响应回退到脱敏通用错误", async () => {
    const error = await readGuestRunError(
      new Response("not-json", {
        status: 503,
        headers: { "X-Request-Id": "safe-request-id" },
      })
    );

    expect(error).toMatchObject({
      code: "unknown_error",
      status: 503,
      requestId: "safe-request-id",
      message: "模型服务暂时不可用，请稍后重试。",
    });
  });

  test("SSE 中途错误帧转换为结构化异常", () => {
    const response = new Response(null, {
      status: 200,
      headers: { "X-Request-Id": "response-id" },
    });

    expect(() =>
      parseGuestStreamData(
        JSON.stringify({
          type: "guest_run_error",
          error: {
            code: "model_service_unavailable",
            message: "模型服务暂时不可用。",
            requestId: "stream-id",
          },
        }),
        response
      )
    ).toThrow(
      expect.objectContaining({
        code: "model_service_unavailable",
        requestId: "stream-id",
        status: undefined,
      })
    );
  });
});
