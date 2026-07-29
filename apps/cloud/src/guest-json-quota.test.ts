import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { JsonGuestQuotaStore } from "./guest-json-quota";

describe("JSON guest quota store", () => {
  test("persists only HMAC identities across instances", () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), "llm-space-quota-"));
    const filePath = path.join(directory, "quota.json");
    try {
      const first = new JsonGuestQuotaStore(filePath, "s".repeat(32));
      const consumed = first.consume({
        guestId: "browser-identity",
        ip: "203.0.113.10",
        now: new Date("2026-07-29T12:00:00.000Z"),
        browserDailyLimit: 2,
        ipDailyLimit: 3,
      });
      const second = new JsonGuestQuotaStore(filePath, "s".repeat(32));
      const restored = second.read(
        "browser-identity",
        "203.0.113.10",
        new Date("2026-07-29T13:00:00.000Z"),
        2,
        3
      );
      const stored = readFileSync(filePath, "utf8");

      expect(consumed.browserRemaining).toBe(1);
      expect(restored.browserRemaining).toBe(1);
      expect(stored).not.toContain("browser-identity");
      expect(stored).not.toContain("203.0.113.10");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
