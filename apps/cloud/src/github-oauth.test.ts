import { describe, expect, test } from "bun:test";

import { createGitHubOAuthClient } from "./github-oauth";

describe("GitHub OAuth client", () => {
  test("builds a state-bound PKCE authorization URL", () => {
    const client = createGitHubOAuthClient({
      clientId: "client-id",
      clientSecret: "client-secret",
    });
    const url = client.createAuthorizationUrl({
      state: "state-value",
      challenge: "pkce-challenge",
      redirectUri: "https://cloud.example.test/auth/github/callback",
    });
    expect(url.origin).toBe("https://github.com");
    expect(url.searchParams.get("state")).toBe("state-value");
    expect(url.searchParams.get("code_challenge")).toBe("pkce-challenge");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.toString()).not.toContain("client-secret");
  });

  test("exchanges a code and reads a normalized identity", async () => {
    const requests: { url: string; init?: RequestInit }[] = [];
    const client = createGitHubOAuthClient({
      clientId: "client-id",
      clientSecret: "client-secret",
      fetch: (input, init) => {
        const url =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;
        requests.push({ url, init });
        if (url.includes("access_token")) {
          return Promise.resolve(
            Response.json({ access_token: "short-lived-token" })
          );
        }
        return Promise.resolve(
          Response.json({
            id: 123,
            login: "octocat",
            name: null,
            avatar_url: "https://avatars.example.test/octocat",
            email: null,
          })
        );
      },
    });
    const token = await client.exchangeCode({
      code: "authorization-code",
      verifier: "pkce-verifier",
      redirectUri: "https://cloud.example.test/auth/github/callback",
    });
    const identity = await client.readIdentity(token);
    expect(identity).toEqual({
      providerUserId: "123",
      login: "octocat",
      displayName: "octocat",
      avatarUrl: "https://avatars.example.test/octocat",
      email: null,
    });
    expect(requests[0]?.init?.body).toContain("pkce-verifier");
    expect(new Headers(requests[1]?.init?.headers).get("authorization")).toBe(
      "Bearer short-lived-token"
    );
  });
});
