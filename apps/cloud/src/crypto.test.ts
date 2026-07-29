import { describe, expect, test } from "bun:test";

import { createOAuthAttempt, hashToken, openOAuthAttempt } from "./crypto";

const SECRET = "test-secret-that-is-at-least-32-bytes";

describe("OAuth attempt sealing", () => {
  test("round-trips a state-bound PKCE verifier", () => {
    const attempt = createOAuthAttempt(SECRET, 1_000, 10_000);
    expect(
      openOAuthAttempt(attempt.sealed, attempt.state, SECRET, 5_000)
    ).toEqual({ verifier: attempt.verifier });
    expect(attempt.challenge).not.toBe(attempt.verifier);
  });

  test("rejects a changed state, tampering, and expiry", () => {
    const attempt = createOAuthAttempt(SECRET, 1_000, 1_000);
    expect(openOAuthAttempt(attempt.sealed, "wrong", SECRET, 1_500)).toBeNull();
    expect(
      openOAuthAttempt(`${attempt.sealed}x`, attempt.state, SECRET, 1_500)
    ).toBeNull();
    expect(
      openOAuthAttempt(attempt.sealed, attempt.state, SECRET, 2_001)
    ).toBeNull();
  });
});

describe("session token hashing", () => {
  test("is deterministic without retaining the raw token", () => {
    const hash = hashToken("opaque-session-token");
    expect(hash).toHaveLength(64);
    expect(hash).toBe(hashToken("opaque-session-token"));
    expect(hash).not.toContain("opaque-session-token");
  });
});
