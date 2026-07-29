import { describe, expect, test } from "bun:test";

import { GuestQuotaStore } from "./guest-quota";

describe("guest quota store", () => {
  test("enforces browser and IP limits and resets on the next UTC day", () => {
    const store = new GuestQuotaStore(":memory:", "q".repeat(32));
    const dayOne = new Date("2026-07-29T12:00:00.000Z");
    const dayTwo = new Date("2026-07-30T00:00:00.000Z");

    expect(store.consume(_input("guest-a", "1.2.3.4", dayOne))).toMatchObject({
      allowed: true,
      browserRemaining: 1,
      ipRemaining: 2,
    });
    expect(store.consume(_input("guest-a", "1.2.3.4", dayOne))).toMatchObject({
      allowed: true,
      browserRemaining: 0,
      ipRemaining: 1,
    });
    expect(store.consume(_input("guest-a", "1.2.3.4", dayOne))).toMatchObject({
      allowed: false,
      reason: "browser_daily_limit",
    });
    expect(store.consume(_input("guest-b", "1.2.3.4", dayOne))).toMatchObject({
      allowed: true,
      ipRemaining: 0,
    });
    expect(store.consume(_input("guest-c", "1.2.3.4", dayOne))).toMatchObject({
      allowed: false,
      reason: "ip_daily_limit",
    });
    expect(store.read("guest-a", "1.2.3.4", dayTwo, 2, 3)).toMatchObject({
      allowed: true,
      browserRemaining: 2,
      ipRemaining: 3,
    });

    store.close();
  });

  test("stores only deterministic HMAC identities", () => {
    const store = new GuestQuotaStore(":memory:", "q".repeat(32));

    expect(store.hashIdentity("guest", "opaque-id")).toHaveLength(64);
    expect(store.hashIdentity("guest", "opaque-id")).not.toBe(
      store.hashIdentity("ip", "opaque-id")
    );

    store.close();
  });
});

function _input(guestId: string, ip: string, now: Date) {
  return {
    guestId,
    ip,
    now,
    browserDailyLimit: 2,
    ipDailyLimit: 3,
  };
}
