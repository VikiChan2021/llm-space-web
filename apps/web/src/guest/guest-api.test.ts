import { describe, expect, test } from "bun:test";

import {
  GuestRunError,
  parseGuestStreamData,
  readGuestRunError,
} from "./guest-api";

describe("游客 Run 结构化错误", () => {
  test("保留安全错误码、状态、请求编号和额度", async () => {
    const response = new Response(
      JSON.stringify({
        error: {
          code: "guest_daily_limit",
          message: "今日免费体验额度已用完。",
          requestId: "request-body",
        },
        quota: {
          model: "glm-4.7-flash",
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
