import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

interface OAuthAttemptPayload {
  state: string;
  verifier: string;
  expiresAt: number;
}

export interface OAuthAttempt {
  state: string;
  verifier: string;
  challenge: string;
  sealed: string;
}

export function createOAuthAttempt(
  secret: string,
  now = Date.now(),
  ttlMilliseconds = 10 * 60 * 1000
): OAuthAttempt {
  const state = randomToken(32);
  const verifier = randomToken(48);
  const payload: OAuthAttemptPayload = {
    state,
    verifier,
    expiresAt: now + ttlMilliseconds,
  };
  return {
    state,
    verifier,
    challenge: _base64Url(
      createHash("sha256").update(verifier, "utf8").digest()
    ),
    sealed: _seal(payload, secret),
  };
}

export function openOAuthAttempt(
  sealed: string,
  expectedState: string,
  secret: string,
  now = Date.now()
): { verifier: string } | null {
  const separator = sealed.lastIndexOf(".");
  if (separator <= 0) return null;
  const payloadText = sealed.slice(0, separator);
  const providedSignature = sealed.slice(separator + 1);
  const expectedSignature = _signature(payloadText, secret);
  if (!_safeEqual(providedSignature, expectedSignature)) return null;

  try {
    const payload = JSON.parse(
      Buffer.from(payloadText, "base64url").toString("utf8")
    ) as Partial<OAuthAttemptPayload>;
    if (
      typeof payload.state !== "string" ||
      typeof payload.verifier !== "string" ||
      typeof payload.expiresAt !== "number" ||
      payload.expiresAt < now ||
      !_safeEqual(payload.state, expectedState)
    ) {
      return null;
    }
    return { verifier: payload.verifier };
  } catch {
    return null;
  }
}

export function randomToken(byteLength = 32): string {
  return _base64Url(randomBytes(byteLength));
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function hashOptionalMetadata(value: string | null): string | null {
  if (!value) return null;
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function _seal(payload: OAuthAttemptPayload, secret: string): string {
  const encoded = _base64Url(Buffer.from(JSON.stringify(payload), "utf8"));
  return `${encoded}.${_signature(encoded, secret)}`;
}

function _signature(value: string, secret: string): string {
  return _base64Url(createHmac("sha256", secret).update(value).digest());
}

function _safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function _base64Url(value: Uint8Array): string {
  return Buffer.from(value).toString("base64url");
}
