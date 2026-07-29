export interface CookieOptions {
  httpOnly?: boolean;
  maxAgeSeconds?: number;
  sameSite?: "Lax" | "Strict";
  secure?: boolean;
}

export function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    const key = part.slice(0, separator).trim();
    if (key !== name) continue;
    try {
      return decodeURIComponent(part.slice(separator + 1).trim());
    } catch {
      return null;
    }
  }
  return null;
}

export function serializeCookie(
  name: string,
  value: string,
  options: CookieOptions
): string {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    `SameSite=${options.sameSite ?? "Lax"}`,
  ];
  if (options.httpOnly !== false) parts.push("HttpOnly");
  if (options.secure) parts.push("Secure");
  if (options.maxAgeSeconds !== undefined) {
    parts.push(`Max-Age=${Math.max(0, Math.floor(options.maxAgeSeconds))}`);
  }
  return parts.join("; ");
}
