import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

import { loadGuestCloudConfig } from "./guest-config";
import { createGuestFetchHandler } from "./guest-http-server";
import { JsonGuestQuotaStore } from "./guest-json-quota";
import { createGuestModelExecutor } from "./guest-model";

const config = loadGuestCloudConfig();
const quotaStore = new JsonGuestQuotaStore(
  config.quotaDatabasePath,
  config.hmacSecret
);
const handler = createGuestFetchHandler({
  config,
  quotaStore,
  execute: createGuestModelExecutor({
    apiKey: config.apiKey,
    modelId: config.modelId,
    maxOutputTokens: config.maxOutputTokens,
  }),
});

const server = createServer(async (request, response) => {
  try {
    const webRequest = await _toWebRequest(request, config.maxRequestBytes);
    await _writeResponse(response, await handler(webRequest));
  } catch (error) {
    const status = error instanceof RequestTooLargeError ? 413 : 500;
    await _writeResponse(
      response,
      Response.json(
        {
          ok: false,
          error: {
            code: status === 413 ? "request_too_large" : "internal_error",
            message:
              status === 413
                ? "当前 Thread 内容过长，请缩短后重试。"
                : "请求暂时无法完成，请稍后重试。",
          },
        },
        { status }
      )
    );
  }
});
server.requestTimeout = 30_000;
server.headersTimeout = 10_000;
server.listen(config.port, config.host, () => {
  console.info(
    `LLM Space guest API listening on http://${config.host}:${config.port}`
  );
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}

class RequestTooLargeError extends Error {}

async function _toWebRequest(
  request: IncomingMessage,
  maxRequestBytes: number
): Promise<Request> {
  const origin = `http://${request.headers.host ?? "127.0.0.1"}`;
  const url = new URL(request.url ?? "/", origin);
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (Array.isArray(value)) {
      for (const item of value) headers.append(name, item);
    } else if (value !== undefined) {
      headers.set(name, value);
    }
  }
  const method = request.method ?? "GET";
  if (method === "GET" || method === "HEAD") {
    return new Request(url, { method, headers });
  }

  const chunks: Uint8Array[] = [];
  let length = 0;
  for await (const chunk of request) {
    const bytes =
      typeof chunk === "string" ? Buffer.from(chunk) : new Uint8Array(chunk);
    length += bytes.byteLength;
    if (length > maxRequestBytes) throw new RequestTooLargeError();
    chunks.push(bytes);
  }
  const body = Buffer.concat(chunks);
  return new Request(url, { method, headers, body });
}

async function _writeResponse(
  target: ServerResponse,
  source: Response
): Promise<void> {
  target.statusCode = source.status;
  source.headers.forEach((value, name) => target.setHeader(name, value));
  if (!source.body) {
    target.end();
    return;
  }
  const reader = source.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!target.write(value)) {
        await new Promise<void>((resolve) => target.once("drain", resolve));
      }
    }
    target.end();
  } finally {
    reader.releaseLock();
  }
}
