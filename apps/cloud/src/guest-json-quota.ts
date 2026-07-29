import { createHmac } from "node:crypto";
import {
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import type {
  ConsumeGuestQuotaInput,
  GuestQuotaDecision,
} from "./guest-quota";

interface QuotaDay {
  guests: Record<string, number>;
  ips: Record<string, number>;
}

interface QuotaFile {
  version: 1;
  days: Record<string, QuotaDay>;
}

/**
 * Single-process quota persistence for the public Alpha. Identifiers are HMAC
 * digests, and writes replace the file atomically. Move this seam to Redis or
 * PostgreSQL before horizontally scaling the guest API.
 */
export class JsonGuestQuotaStore {
  private _state: QuotaFile;

  constructor(
    private readonly _filePath: string,
    private readonly _hmacSecret: string
  ) {
    mkdirSync(path.dirname(path.resolve(_filePath)), { recursive: true });
    this._state = this._read();
  }

  hashIdentity(kind: "guest" | "ip", value: string): string {
    return createHmac("sha256", this._hmacSecret)
      .update(`${kind}:${value}`)
      .digest("hex");
  }

  read(
    guestId: string,
    ip: string,
    now: Date,
    browserDailyLimit: number,
    ipDailyLimit: number
  ): GuestQuotaDecision {
    const day = this._day(now);
    const guestCount =
      day.guests[this.hashIdentity("guest", guestId)] ?? 0;
    const ipCount = day.ips[this.hashIdentity("ip", ip)] ?? 0;
    return this._decision(
      guestCount,
      ipCount,
      browserDailyLimit,
      ipDailyLimit
    );
  }

  consume(input: ConsumeGuestQuotaInput): GuestQuotaDecision {
    const day = this._day(input.now);
    const guestHash = this.hashIdentity("guest", input.guestId);
    const ipHash = this.hashIdentity("ip", input.ip);
    const guestCount = day.guests[guestHash] ?? 0;
    const ipCount = day.ips[ipHash] ?? 0;
    const before = this._decision(
      guestCount,
      ipCount,
      input.browserDailyLimit,
      input.ipDailyLimit
    );
    if (!before.allowed) return before;

    day.guests[guestHash] = guestCount + 1;
    day.ips[ipHash] = ipCount + 1;
    this._prune(this._dayKey(input.now));
    this._write();
    return this._decision(
      guestCount + 1,
      ipCount + 1,
      input.browserDailyLimit,
      input.ipDailyLimit,
      true
    );
  }

  private _day(now: Date): QuotaDay {
    const key = this._dayKey(now);
    return (this._state.days[key] ??= { guests: {}, ips: {} });
  }

  private _dayKey(now: Date): string {
    return now.toISOString().slice(0, 10);
  }

  private _decision(
    guestCount: number,
    ipCount: number,
    browserDailyLimit: number,
    ipDailyLimit: number,
    consumed = false
  ): GuestQuotaDecision {
    const browserRemaining = Math.max(0, browserDailyLimit - guestCount);
    const ipRemaining = Math.max(0, ipDailyLimit - ipCount);
    if (!consumed && guestCount >= browserDailyLimit) {
      return {
        allowed: false,
        browserRemaining,
        ipRemaining,
        reason: "browser_daily_limit",
      };
    }
    if (!consumed && ipCount >= ipDailyLimit) {
      return {
        allowed: false,
        browserRemaining,
        ipRemaining,
        reason: "ip_daily_limit",
      };
    }
    return { allowed: true, browserRemaining, ipRemaining };
  }

  private _prune(currentDay: string): void {
    for (const day of Object.keys(this._state.days)) {
      if (day !== currentDay) delete this._state.days[day];
    }
  }

  private _read(): QuotaFile {
    try {
      const parsed = JSON.parse(readFileSync(this._filePath, "utf8")) as QuotaFile;
      if (parsed.version === 1 && parsed.days) return parsed;
    } catch {
      // A missing file is the normal first-run path.
    }
    return { version: 1, days: {} };
  }

  private _write(): void {
    const temporaryPath = `${this._filePath}.${process.pid}.tmp`;
    writeFileSync(temporaryPath, JSON.stringify(this._state), {
      encoding: "utf8",
      mode: 0o600,
    });
    renameSync(temporaryPath, this._filePath);
  }
}
