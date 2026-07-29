import { describe, expect, test } from "bun:test";

import type { CloudConfig } from "./config";
import { hashToken } from "./crypto";
import type {
  GitHubAuthorizationInput,
  GitHubCodeExchangeInput,
  GitHubOAuthClient,
} from "./github-oauth";
import { createCloudFetchHandler } from "./http-server";
import type {
  CloudRepository,
  CreateSessionInput,
  GitHubIdentity,
  ProvisionedAccount,
  SessionPrincipal,
} from "./types";

const NOW = new Date("2026-07-29T10:00:00.000Z");

class FakeRepository implements CloudRepository {
  readonly sessions = new Map<string, SessionPrincipal>();
  readonly revoked = new Set<string>();

  provisionGitHubIdentity(
    identity: GitHubIdentity
  ): Promise<ProvisionedAccount> {
    return Promise.resolve(_account(identity.providerUserId));
  }

  createSession(input: CreateSessionInput): Promise<void> {
    this.sessions.set(input.tokenHash, {
      ..._account(input.userId),
      sessionId: `session-${input.userId}`,
      expiresAt: input.expiresAt,
    });
    return Promise.resolve();
  }

  readSession(tokenHash: string, now: Date): Promise<SessionPrincipal | null> {
    const session = this.sessions.get(tokenHash);
    if (!session || this.revoked.has(tokenHash) || session.expiresAt <= now) {
      return Promise.resolve(null);
    }
    return Promise.resolve(session);
  }

  revokeSession(tokenHash: string): Promise<void> {
    this.revoked.add(tokenHash);
    return Promise.resolve();
  }

  close(): Promise<void> {
    return Promise.resolve();
  }
}

class FakeGitHubClient implements GitHubOAuthClient {
  authorizationInput: GitHubAuthorizationInput | null = null;
  exchangeInput: GitHubCodeExchangeInput | null = null;

  createAuthorizationUrl(input: GitHubAuthorizationInput): URL {
    this.authorizationInput = input;
    const url = new URL("https://github.test/authorize");
    url.searchParams.set("state", input.state);
    return url;
  }

  exchangeCode(input: GitHubCodeExchangeInput): Promise<string> {
    this.exchangeInput = input;
    return Promise.resolve("temporary-github-token");
  }

  readIdentity(accessToken: string): Promise<GitHubIdentity> {
    expect(accessToken).toBe("temporary-github-token");
    return Promise.resolve({
      providerUserId: "github-123",
      login: "octocat",
      displayName: "The Octocat",
      avatarUrl: "https://avatars.example.test/octocat",
      email: null,
    });
  }
}

describe("Cloud identity HTTP flow", () => {
  test("creates an opaque session and returns only its own tenant", async () => {
    const repository = new FakeRepository();
    const github = new FakeGitHubClient();
    const fetchHandler = createCloudFetchHandler({
      config: _config(),
      repository,
      github,
      now: () => NOW,
    });

    const start = await fetchHandler(
      new Request("http://cloud.example.test/auth/github")
    );
    expect(start.status).toBe(302);
    expect(github.authorizationInput?.challenge).toBeTruthy();
    const state = github.authorizationInput?.state;
    expect(state).toBeTruthy();
    const oauthCookie = _cookiePair(
      start.headers.get("set-cookie"),
      "llm_space_oauth"
    );

    const callback = await fetchHandler(
      new Request(
        `http://cloud.example.test/auth/github/callback?code=code-1&state=${state}`,
        { headers: { Cookie: oauthCookie } }
      )
    );
    expect(callback.status).toBe(302);
    expect(callback.headers.get("location")).toBe(
      "http://cloud.example.test/#/workbench"
    );
    expect(github.exchangeInput?.code).toBe("code-1");
    const sessionCookie = _cookiePair(
      callback.headers.get("set-cookie"),
      "llm_space_session"
    );
    const rawSessionToken = decodeURIComponent(sessionCookie.split("=")[1]);
    expect(repository.sessions.has(hashToken(rawSessionToken))).toBe(true);

    const session = await fetchHandler(
      new Request("http://cloud.example.test/api/session", {
        headers: {
          Cookie: sessionCookie,
          "X-Tenant-Id": "attacker-controlled-tenant",
        },
      })
    );
    expect(session.status).toBe(200);
    const body = (await session.json()) as {
      tenant: { id: string };
      workspace: { id: string };
    };
    expect(body.tenant.id).toBe("tenant-github-123");
    expect(body.workspace.id).toBe("workspace-github-123");
    expect(JSON.stringify(body)).not.toContain("attacker-controlled-tenant");
  });

  test("rejects an invalid OAuth state", async () => {
    const repository = new FakeRepository();
    const github = new FakeGitHubClient();
    const fetchHandler = createCloudFetchHandler({
      config: _config(),
      repository,
      github,
      now: () => NOW,
    });
    const start = await fetchHandler(
      new Request("http://cloud.example.test/auth/github")
    );
    const oauthCookie = _cookiePair(
      start.headers.get("set-cookie"),
      "llm_space_oauth"
    );
    const callback = await fetchHandler(
      new Request(
        "http://cloud.example.test/auth/github/callback?code=code-1&state=wrong",
        { headers: { Cookie: oauthCookie } }
      )
    );
    expect(callback.status).toBe(400);
    expect(repository.sessions.size).toBe(0);
  });

  test("uses __Host cookies on an HTTPS public origin", async () => {
    const repository = new FakeRepository();
    const github = new FakeGitHubClient();
    const config = _config();
    config.publicUrl = new URL("https://cloud.example.test");
    config.secureCookies = true;
    const fetchHandler = createCloudFetchHandler({
      config,
      repository,
      github,
      now: () => NOW,
    });
    const response = await fetchHandler(
      new Request("https://cloud.example.test/auth/github")
    );
    const cookie = response.headers.get("set-cookie");
    expect(cookie).toStartWith("__Host-llm_space_oauth=");
    expect(cookie).toContain("; Secure");
    expect(cookie).not.toContain("Domain=");
  });

  test("requires same-origin logout and revokes the session", async () => {
    const repository = new FakeRepository();
    const github = new FakeGitHubClient();
    const fetchHandler = createCloudFetchHandler({
      config: _config(),
      repository,
      github,
      now: () => NOW,
    });
    const rawToken = "known-session-token";
    repository.sessions.set(hashToken(rawToken), {
      ..._account("github-123"),
      sessionId: "session-1",
      expiresAt: new Date(NOW.getTime() + 60_000),
    });

    const crossOrigin = await fetchHandler(
      new Request("http://cloud.example.test/api/logout", {
        method: "POST",
        headers: {
          Cookie: `llm_space_session=${rawToken}`,
          Origin: "https://attacker.example.test",
        },
      })
    );
    expect(crossOrigin.status).toBe(403);

    const sameOrigin = await fetchHandler(
      new Request("http://cloud.example.test/api/logout", {
        method: "POST",
        headers: {
          Cookie: `llm_space_session=${rawToken}`,
          Origin: "http://cloud.example.test",
        },
      })
    );
    expect(sameOrigin.status).toBe(200);
    expect(repository.revoked.has(hashToken(rawToken))).toBe(true);
  });
});

function _config(): CloudConfig {
  return {
    host: "127.0.0.1",
    port: 8787,
    publicUrl: new URL("http://cloud.example.test"),
    databaseUrl: "postgres://unused",
    migrationDatabaseUrl: "postgres://unused",
    databaseRuntimeRole: null,
    githubClientId: "client-id",
    githubClientSecret: "client-secret",
    sessionSecret: "test-secret-that-is-at-least-32-bytes",
    sessionTtlSeconds: 3_600,
    secureCookies: false,
    autoMigrate: false,
  };
}

function _account(id: string): ProvisionedAccount {
  return {
    user: {
      id,
      login: "octocat",
      displayName: "The Octocat",
      avatarUrl: null,
    },
    tenant: { id: `tenant-${id}`, name: "Octocat's Space" },
    workspace: { id: `workspace-${id}`, name: "My Workspace" },
  };
}

function _cookiePair(header: string | null, name: string): string {
  const match = header?.match(new RegExp(`(?:^|,\\s*)${name}=([^;,]*)`));
  if (!match) throw new Error(`Missing cookie ${name}.`);
  return `${name}=${match[1]}`;
}
