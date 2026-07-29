import { createHmac } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";

import { Database } from "bun:sqlite";

export interface GuestQuotaDecision {
  allowed: boolean;
  browserRemaining: number;
  ipRemaining: number;
  reason?: "browser_daily_limit" | "ip_daily_limit";
}

export interface ConsumeGuestQuotaInput {
  guestId: string;
  ip: string;
  now: Date;
  browserDailyLimit: number;
  ipDailyLimit: number;
}

export class GuestQuotaStore {
  private readonly _database: Database;

  constructor(
    databasePath: string,
    private readonly _hmacSecret: string
  ) {
    if (databasePath !== ":memory:") {
      mkdirSync(path.dirname(path.resolve(databasePath)), { recursive: true });
    }
    this._database = new Database(databasePath, { create: true });
    this._database.run("PRAGMA journal_mode = WAL");
    this._database.run("PRAGMA busy_timeout = 5000");
    this._database.run(`
      CREATE TABLE IF NOT EXISTS guest_daily_usage (
        identity_hash TEXT NOT NULL,
        day TEXT NOT NULL,
        run_count INTEGER NOT NULL CHECK (run_count >= 0),
        PRIMARY KEY (identity_hash, day)
      )
    `);
    this._database.run(`
      CREATE TABLE IF NOT EXISTS ip_daily_usage (
        identity_hash TEXT NOT NULL,
        day TEXT NOT NULL,
        run_count INTEGER NOT NULL CHECK (run_count >= 0),
        PRIMARY KEY (identity_hash, day)
      )
    `);
  }

  read(
    guestId: string,
    ip: string,
    now: Date,
    browserDailyLimit: number,
    ipDailyLimit: number
  ): GuestQuotaDecision {
    const day = _utcDay(now);
    const browserCount = this._readCount(
      "guest_daily_usage",
      this.hashIdentity("guest", guestId),
      day
    );
    const ipCount = this._readCount(
      "ip_daily_usage",
      this.hashIdentity("ip", ip),
      day
    );
    return _decision(
      browserCount,
      ipCount,
      browserDailyLimit,
      ipDailyLimit
    );
  }

  consume(input: ConsumeGuestQuotaInput): GuestQuotaDecision {
    const day = _utcDay(input.now);
    const guestHash = this.hashIdentity("guest", input.guestId);
    const ipHash = this.hashIdentity("ip", input.ip);
    const transaction = this._database.transaction(() => {
      const browserCount = this._readCount(
        "guest_daily_usage",
        guestHash,
        day
      );
      const ipCount = this._readCount("ip_daily_usage", ipHash, day);
      const decision = _decision(
        browserCount,
        ipCount,
        input.browserDailyLimit,
        input.ipDailyLimit
      );
      if (!decision.allowed) return decision;

      this._increment("guest_daily_usage", guestHash, day);
      this._increment("ip_daily_usage", ipHash, day);
      return {
        allowed: true,
        browserRemaining: Math.max(
          0,
          input.browserDailyLimit - browserCount - 1
        ),
        ipRemaining: Math.max(0, input.ipDailyLimit - ipCount - 1),
      };
    });
    return transaction.immediate();
  }

  hashIdentity(kind: "guest" | "ip", value: string): string {
    return createHmac("sha256", this._hmacSecret)
      .update(`${kind}\0${value}`)
      .digest("hex");
  }

  close(): void {
    this._database.close();
  }

  private _readCount(
    table: "guest_daily_usage" | "ip_daily_usage",
    identityHash: string,
    day: string
  ): number {
    const row = this._database
      .query<{ run_count: number }, [string, string]>(
        `SELECT run_count FROM ${table} WHERE identity_hash = ? AND day = ?`
      )
      .get(identityHash, day);
    return row?.run_count ?? 0;
  }

  private _increment(
    table: "guest_daily_usage" | "ip_daily_usage",
    identityHash: string,
    day: string
  ): void {
    this._database
      .query(
        `INSERT INTO ${table} (identity_hash, day, run_count)
         VALUES (?, ?, 1)
         ON CONFLICT(identity_hash, day)
         DO UPDATE SET run_count = run_count + 1`
      )
      .run(identityHash, day);
  }
}

function _decision(
  browserCount: number,
  ipCount: number,
  browserDailyLimit: number,
  ipDailyLimit: number
): GuestQuotaDecision {
  const browserRemaining = Math.max(0, browserDailyLimit - browserCount);
  const ipRemaining = Math.max(0, ipDailyLimit - ipCount);
  if (browserRemaining <= 0) {
    return {
      allowed: false,
      browserRemaining,
      ipRemaining,
      reason: "browser_daily_limit",
    };
  }
  if (ipRemaining <= 0) {
    return {
      allowed: false,
      browserRemaining,
      ipRemaining,
      reason: "ip_daily_limit",
    };
  }
  return { allowed: true, browserRemaining, ipRemaining };
}

function _utcDay(now: Date): string {
  return now.toISOString().slice(0, 10);
}
