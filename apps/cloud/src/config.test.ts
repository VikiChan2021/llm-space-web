import { describe, expect, test } from "bun:test";

import { loadCloudConfig, loadCloudMigrationConfig } from "./config";

const VALID_ENVIRONMENT = {
  CLOUD_PUBLIC_URL: "http://127.0.0.1:8787",
  CLOUD_DATABASE_URL: "postgres://test:test@127.0.0.1/test",
  CLOUD_SESSION_SECRET: "a".repeat(32),
  GITHUB_CLIENT_ID: "client-id",
  GITHUB_CLIENT_SECRET: "client-secret",
};

describe("loadCloudConfig", () => {
  test("loads safe local defaults", () => {
    const config = loadCloudConfig(VALID_ENVIRONMENT);
    expect(config.host).toBe("127.0.0.1");
    expect(config.port).toBe(8787);
    expect(config.secureCookies).toBe(false);
    expect(config.sessionTtlSeconds).toBe(60 * 60 * 24 * 30);
    expect(config.migrationDatabaseUrl).toBe(config.databaseUrl);
  });

  test("requires a long session secret", () => {
    expect(() =>
      loadCloudConfig({
        ...VALID_ENVIRONMENT,
        CLOUD_SESSION_SECRET: "too-short",
      })
    ).toThrow("at least 32 bytes");
  });

  test("rejects a public URL with a query", () => {
    expect(() =>
      loadCloudConfig({
        ...VALID_ENVIRONMENT,
        CLOUD_PUBLIC_URL: "https://cloud.example.test/?unsafe=1",
      })
    ).toThrow("must be an origin");
  });

  test("rejects a public URL with a path", () => {
    expect(() =>
      loadCloudConfig({
        ...VALID_ENVIRONMENT,
        CLOUD_PUBLIC_URL: "https://cloud.example.test/tenant-one",
      })
    ).toThrow("must not contain a path");
  });

  test("rejects an unsafe runtime role identifier", () => {
    expect(() =>
      loadCloudConfig({
        ...VALID_ENVIRONMENT,
        CLOUD_DATABASE_RUNTIME_ROLE: "runtime; DROP TABLE users",
      })
    ).toThrow("lowercase PostgreSQL identifier");
  });
});

describe("loadCloudMigrationConfig", () => {
  test("does not require OAuth or session secrets", () => {
    expect(
      loadCloudMigrationConfig({
        CLOUD_MIGRATION_DATABASE_URL: "postgres://migration:test@db/cloud",
        CLOUD_DATABASE_RUNTIME_ROLE: "llm_space_cloud_app",
      })
    ).toEqual({
      migrationDatabaseUrl: "postgres://migration:test@db/cloud",
      databaseRuntimeRole: "llm_space_cloud_app",
    });
  });
});
