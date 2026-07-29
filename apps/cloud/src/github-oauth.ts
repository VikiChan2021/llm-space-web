import type { GitHubIdentity } from "./types";

export interface GitHubAuthorizationInput {
  state: string;
  challenge: string;
  redirectUri: string;
}

export interface GitHubCodeExchangeInput {
  code: string;
  verifier: string;
  redirectUri: string;
}

export interface GitHubOAuthClient {
  createAuthorizationUrl(input: GitHubAuthorizationInput): URL;
  exchangeCode(input: GitHubCodeExchangeInput): Promise<string>;
  readIdentity(accessToken: string): Promise<GitHubIdentity>;
}

interface GitHubOAuthClientOptions {
  clientId: string;
  clientSecret: string;
  fetch?: (
    input: string | URL | Request,
    init?: RequestInit
  ) => Promise<Response>;
}

export function createGitHubOAuthClient(
  options: GitHubOAuthClientOptions
): GitHubOAuthClient {
  const request = options.fetch ?? fetch;
  return {
    createAuthorizationUrl(input) {
      const url = new URL("https://github.com/login/oauth/authorize");
      url.searchParams.set("client_id", options.clientId);
      url.searchParams.set("redirect_uri", input.redirectUri);
      url.searchParams.set("state", input.state);
      url.searchParams.set("scope", "read:user");
      url.searchParams.set("code_challenge", input.challenge);
      url.searchParams.set("code_challenge_method", "S256");
      return url;
    },
    async exchangeCode(input) {
      const response = await request(
        "https://github.com/login/oauth/access_token",
        {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            "User-Agent": "LLM-Space-Cloud",
          },
          body: JSON.stringify({
            client_id: options.clientId,
            client_secret: options.clientSecret,
            code: input.code,
            code_verifier: input.verifier,
            redirect_uri: input.redirectUri,
          }),
        }
      );
      const body = (await response.json()) as {
        access_token?: unknown;
        error?: unknown;
      };
      if (!response.ok || typeof body.access_token !== "string") {
        throw new Error(
          typeof body.error === "string"
            ? `GitHub token exchange failed: ${body.error}`
            : "GitHub token exchange failed."
        );
      }
      return body.access_token;
    },
    async readIdentity(accessToken) {
      const response = await request("https://api.github.com/user", {
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${accessToken}`,
          "User-Agent": "LLM-Space-Cloud",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      });
      const body = (await response.json()) as {
        id?: unknown;
        login?: unknown;
        name?: unknown;
        avatar_url?: unknown;
        email?: unknown;
      };
      if (
        !response.ok ||
        (typeof body.id !== "number" && typeof body.id !== "string") ||
        typeof body.login !== "string"
      ) {
        throw new Error("GitHub identity lookup failed.");
      }
      return {
        providerUserId: String(body.id),
        login: body.login,
        displayName:
          typeof body.name === "string" && body.name.trim()
            ? body.name.trim()
            : body.login,
        avatarUrl: typeof body.avatar_url === "string" ? body.avatar_url : null,
        email: typeof body.email === "string" ? body.email : null,
      };
    },
  };
}
