import { describe, expect, test } from "bun:test";

import { GuestRunError } from "./guest-api";
import { describeGuestRunFailure } from "./guest-run-recovery";

describe("游客 Run 恢复文案", () => {
  test("额度耗尽显示重置时间且不允许无效重试", () => {
    const presentation = describeGuestRunFailure(
      new GuestRunError("额度已用完", {
        code: "guest_daily_limit",
        status: 429,
        requestId: "safe-id",
        quota: {
          model: "glm-4.5-air",
          browserDailyLimit: 20,
          browserRemaining: 0,
          ipRemaining: 0,
          resetsAt: "2026-07-31T00:00:00.000Z",
          byokAvailable: false,
        },
      })
    );

    expect(presentation.title).toBe("今日免费额度已用完");
    expect(presentation.retryable).toBeUndefined();
    expect(presentation.description).toContain("BYOK 尚未开放");
    expect(presentation.details).toContainEqual({
      label: "请求编号",
      value: "safe-id",
    });
  });

  test("短期限流允许用户稍后手动重试", () => {
    const presentation = describeGuestRunFailure(
      new GuestRunError("已有运行", {
        code: "guest_concurrency_limit",
        status: 429,
      })
    );

    expect(presentation).toMatchObject({
      title: "运行请求过于频繁",
      retryable: true,
    });
    expect(presentation.description).not.toContain("切换");
  });

  test("输入限制不给出盲目重试", () => {
    const presentation = describeGuestRunFailure(
      new GuestRunError("文本过长", {
        code: "text_limit",
        status: 413,
      })
    );

    expect(presentation).toMatchObject({
      title: "请检查当前 Thread",
      description: "文本过长",
    });
    expect(presentation.retryable).toBeUndefined();
  });

  test("图片模型不匹配时明确引导切换到 GLM-4.6V", () => {
    const presentation = describeGuestRunFailure(
      new GuestRunError("当前模型不支持图片", {
        code: "guest_model_input_unsupported",
        status: 400,
      })
    );

    expect(presentation).toMatchObject({
      tone: "warning",
      title: "当前模型不支持图片输入",
      description: "请在左侧 Models 中切换到 GLM-4.6V 后重新运行。",
    });
  });

  test("网络失败保留手动重试入口", () => {
    expect(describeGuestRunFailure(new TypeError("Failed to fetch"))).toMatchObject(
      {
        title: "网络连接失败",
        retryable: true,
      }
    );
  });

  test("模型服务错误建议切换其他智谱模型", () => {
    const presentation = describeGuestRunFailure(
      new GuestRunError("当前模型不可用", {
        code: "model_service_unavailable",
        requestId: "safe-id",
      })
    );

    expect(presentation).toMatchObject({
      title: "模型服务暂时不可用",
      retryable: true,
    });
    expect(presentation.description).toContain("切换其他智谱模型");
  });
});
