export interface CloudConfig {
  host: string;
  port: number;
  publicUrl: URL;
  databaseUrl: string;
  migrationDatabaseUrl: string;
  databaseRuntimeRole: string | null;
  githubClientId: string;
  githubClientSecret: string;
  sessionSecret: string;
  sessionTtlSeconds: number;
  secureCookies: boolean;
  autoMigrate: boolean;
}

export interface CloudMigrationConfig {
  migrationDatabaseUrl: string;
  databaseRuntimeRole: string | null;
}

export function loadCloudConfig(
  environment: Record<string, string | undefined> = process.env
): CloudConfig {
  const publicUrl = _readUrl(environment.CLOUD_PUBLIC_URL, "CLOUD_PUBLIC_URL");
  const sessionSecret = _required(
    environment.CLOUD_SESSION_SECRET,
    "CLOUD_SESSION_SECRET"
  );
  if (Buffer.byteLength(sessionSecret, "utf8") < 32) {
    throw new Error("CLOUD_SESSION_SECRET must be at least 32 bytes.");
  }

  const databaseUrl = _required(
    environment.CLOUD_DATABASE_URL,
    "CLOUD_DATABASE_URL"
  );
  const databaseRuntimeRole = _readRuntimeRole(environment);

  return {
    host: environment.CLOUD_HOST?.trim() || "127.0.0.1",
    port: _readInteger(environment.CLOUD_PORT, "CLOUD_PORT", 8787, 1, 65_535),
    publicUrl,
    databaseUrl,
    migrationDatabaseUrl:
      environment.CLOUD_MIGRATION_DATABASE_URL?.trim() || databaseUrl,
    databaseRuntimeRole,
    githubClientId: _required(environment.GITHUB_CLIENT_ID, "GITHUB_CLIENT_ID"),
    githubClientSecret: _required(
      environment.GITHUB_CLIENT_SECRET,
      "GITHUB_CLIENT_SECRET"
    ),
    sessionSecret,
    sessionTtlSeconds: _readInteger(
      environment.CLOUD_SESSION_TTL_SECONDS,
      "CLOUD_SESSION_TTL_SECONDS",
      60 * 60 * 24 * 30,
      60,
      60 * 60 * 24 * 90
    ),
    secureCookies: publicUrl.protocol === "https:",
    autoMigrate: environment.CLOUD_AUTO_MIGRATE === "1",
  };
}

export function loadCloudMigrationConfig(
  environment: Record<string, string | undefined> = process.env
): CloudMigrationConfig {
  return {
    migrationDatabaseUrl: _required(
      environment.CLOUD_MIGRATION_DATABASE_URL ??
        environment.CLOUD_DATABASE_URL,
      "CLOUD_MIGRATION_DATABASE_URL or CLOUD_DATABASE_URL"
    ),
    databaseRuntimeRole: _readRuntimeRole(environment),
  };
}

function _required(value: string | undefined, name: string): string {
  const trimmed = value?.trim();
  if (!trimmed) throw new Error(`${name} is required.`);
  return trimmed;
}

function _readUrl(value: string | undefined, name: string): URL {
  const parsed = new URL(_required(value, name));
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`${name} must use http or https.`);
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error(
      `${name} must be an origin without credentials or a query.`
    );
  }
  if (parsed.pathname !== "/") {
    throw new Error(`${name} must not contain a path.`);
  }
  return parsed;
}

function _readInteger(
  value: string | undefined,
  name: string,
  fallback: number,
  minimum: number,
  maximum: number
): number {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(
      `${name} must be an integer from ${minimum} to ${maximum}.`
    );
  }
  return parsed;
}

function _readRuntimeRole(
  environment: Record<string, string | undefined>
): string | null {
  const role = environment.CLOUD_DATABASE_RUNTIME_ROLE?.trim() || null;
  if (role && !/^[a-z_][a-z0-9_]{0,62}$/.test(role)) {
    throw new Error(
      "CLOUD_DATABASE_RUNTIME_ROLE must be a lowercase PostgreSQL identifier."
    );
  }
  return role;
}
