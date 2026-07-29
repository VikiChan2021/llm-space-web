import type { CloudConfig } from "./config";
import { readCookie, serializeCookie } from "./cookies";
import {
  createOAuthAttempt,
  hashOptionalMetadata,
  hashToken,
  openOAuthAttempt,
  randomToken,
} from "./crypto";
import type { GitHubOAuthClient } from "./github-oauth";
import type { CloudRepository, SessionPrincipal } from "./types";

const OAUTH_COOKIE = "llm_space_oauth";
const SESSION_COOKIE = "llm_space_session";

export interface CloudHttpDependencies {
  config: CloudConfig;
  repository: CloudRepository;
  github: GitHubOAuthClient;
  now?: () => Date;
}

export function startCloudHttpServer(
  dependencies: CloudHttpDependencies
): Bun.Server<unknown> {
  return Bun.serve({
    hostname: dependencies.config.host,
    port: dependencies.config.port,
    fetch: createCloudFetchHandler(dependencies),
  });
}

export function createCloudFetchHandler(dependencies: CloudHttpDependencies) {
  const now = dependencies.now ?? (() => new Date());
  const redirectUri = new URL(
    "/auth/github/callback",
    dependencies.config.publicUrl
  ).toString();

  return async function cloudFetchHandler(request: Request): Promise<Response> {
    try {
      const url = new URL(request.url);
      if (request.method === "GET" && url.pathname === "/health") {
        return _json({ ok: true, service: "llm-space-cloud" });
      }
      if (request.method === "GET" && url.pathname === "/auth/github") {
        const attempt = createOAuthAttempt(
          dependencies.config.sessionSecret,
          now().getTime()
        );
        const authorizationUrl = dependencies.github.createAuthorizationUrl({
          state: attempt.state,
          challenge: attempt.challenge,
          redirectUri,
        });
        return _redirect(authorizationUrl, [
          _oauthCookie(
            attempt.sealed,
            dependencies.config.secureCookies,
            10 * 60
          ),
        ]);
      }
      if (
        request.method === "GET" &&
        url.pathname === "/auth/github/callback"
      ) {
        const state = url.searchParams.get("state");
        const code = url.searchParams.get("code");
        const sealed = readCookie(
          request,
          _cookieName(OAUTH_COOKIE, dependencies.config.secureCookies)
        );
        if (!state || !code || !sealed) {
          throw new CloudHttpError(
            400,
            "invalid_oauth_callback",
            "GitHub sign-in could not be verified."
          );
        }
        const attempt = openOAuthAttempt(
          sealed,
          state,
          dependencies.config.sessionSecret,
          now().getTime()
        );
        if (!attempt) {
          throw new CloudHttpError(
            400,
            "invalid_oauth_state",
            "GitHub sign-in expired or could not be verified."
          );
        }

        const accessToken = await dependencies.github.exchangeCode({
          code,
          verifier: attempt.verifier,
          redirectUri,
        });
        const identity = await dependencies.github.readIdentity(accessToken);
        const account =
          await dependencies.repository.provisionGitHubIdentity(identity);
        const sessionToken = randomToken();
        const issuedAt = now();
        const expiresAt = new Date(
          issuedAt.getTime() + dependencies.config.sessionTtlSeconds * 1000
        );
        await dependencies.repository.createSession({
          tokenHash: hashToken(sessionToken),
          userId: account.user.id,
          tenantId: account.tenant.id,
          expiresAt,
          userAgentHash: hashOptionalMetadata(
            request.headers.get("user-agent")
          ),
          ipHash: null,
        });

        return _redirect(
          new URL("/#/workbench", dependencies.config.publicUrl),
          [
            _oauthCookie("", dependencies.config.secureCookies, 0),
            _sessionCookie(
              sessionToken,
              dependencies.config.secureCookies,
              dependencies.config.sessionTtlSeconds
            ),
          ]
        );
      }
      if (request.method === "GET" && url.pathname === "/api/session") {
        const principal = await _requireSession(request, dependencies, now());
        return _json(_publicPrincipal(principal));
      }
      if (request.method === "POST" && url.pathname === "/api/logout") {
        _assertSameOrigin(request, dependencies.config.publicUrl);
        const token = _sessionToken(request, dependencies.config.secureCookies);
        if (token) {
          await dependencies.repository.revokeSession(hashToken(token), now());
        }
        return _json(
          { ok: true },
          {
            headers: {
              "Set-Cookie": _sessionCookie(
                "",
                dependencies.config.secureCookies,
                0
              ),
            },
          }
        );
      }
      return _json(
        {
          ok: false,
          error: { code: "not_found", message: "Endpoint not found." },
        },
        { status: 404 }
      );
    } catch (error) {
      const known =
        error instanceof CloudHttpError
          ? error
          : new CloudHttpError(
              500,
              "internal_error",
              "The request could not be completed."
            );
      if (!(error instanceof CloudHttpError)) {
        console.error("Cloud request failed.", error);
      }
      return _json(
        {
          ok: false,
          error: { code: known.code, message: known.message },
        },
        { status: known.status }
      );
    }
  };
}

class CloudHttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string
  ) {
    super(message);
  }
}

async function _requireSession(
  request: Request,
  dependencies: CloudHttpDependencies,
  now: Date
): Promise<SessionPrincipal> {
  const token = _sessionToken(request, dependencies.config.secureCookies);
  if (!token) {
    throw new CloudHttpError(401, "unauthorized", "Sign in is required.");
  }
  const principal = await dependencies.repository.readSession(
    hashToken(token),
    now
  );
  if (!principal) {
    throw new CloudHttpError(
      401,
      "session_expired",
      "The session has expired."
    );
  }
  return principal;
}

function _sessionToken(request: Request, secure: boolean): string | null {
  return readCookie(request, _cookieName(SESSION_COOKIE, secure));
}

function _assertSameOrigin(request: Request, expected: URL): void {
  const origin = request.headers.get("origin");
  if (!origin) {
    throw new CloudHttpError(
      403,
      "origin_required",
      "A same-origin request is required."
    );
  }
  try {
    if (new URL(origin).origin !== expected.origin) throw new Error();
  } catch {
    throw new CloudHttpError(
      403,
      "origin_mismatch",
      "A same-origin request is required."
    );
  }
}

function _publicPrincipal(principal: SessionPrincipal) {
  return {
    authenticated: true,
    expiresAt: principal.expiresAt.toISOString(),
    user: principal.user,
    tenant: principal.tenant,
    workspace: principal.workspace,
  };
}

function _oauthCookie(
  value: string,
  secure: boolean,
  maxAgeSeconds: number
): string {
  return serializeCookie(_cookieName(OAUTH_COOKIE, secure), value, {
    httpOnly: true,
    sameSite: "Lax",
    secure,
    maxAgeSeconds,
  });
}

function _sessionCookie(
  value: string,
  secure: boolean,
  maxAgeSeconds: number
): string {
  return serializeCookie(_cookieName(SESSION_COOKIE, secure), value, {
    httpOnly: true,
    sameSite: "Lax",
    secure,
    maxAgeSeconds,
  });
}

function _cookieName(name: string, secure: boolean): string {
  return secure ? `__Host-${name}` : name;
}

function _json(body: unknown, init: ResponseInit = {}): Response {
  const headers = _securityHeaders(init.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");
  return new Response(`${JSON.stringify(body)}\n`, { ...init, headers });
}

function _redirect(location: URL, cookies: string[]): Response {
  const headers = _securityHeaders();
  headers.set("Location", location.toString());
  for (const cookie of cookies) headers.append("Set-Cookie", cookie);
  return new Response(null, { status: 302, headers });
}

function _securityHeaders(initial?: HeadersInit): Headers {
  const headers = new Headers(initial);
  headers.set("Cache-Control", "no-store");
  headers.set("Referrer-Policy", "no-referrer");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
  return headers;
}
