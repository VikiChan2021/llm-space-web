import { loadGuestCloudConfig } from "./guest-config";
import { startGuestHttpServer } from "./guest-http-server";
import { createGuestModelExecutor } from "./guest-model";
import { GuestQuotaStore } from "./guest-quota";

const config = loadGuestCloudConfig();
const quotaStore = new GuestQuotaStore(
  config.quotaDatabasePath,
  config.hmacSecret
);
const execute = createGuestModelExecutor({
  apiKey: config.apiKey,
  modelId: config.modelId,
  maxOutputTokens: config.maxOutputTokens,
});
const server = startGuestHttpServer({ config, quotaStore, execute });

console.info(`LLM Space Guest API listening at ${server.url.origin}`);

let stopping = false;
async function _stop(): Promise<void> {
  if (stopping) return;
  stopping = true;
  await server.stop(true);
  quotaStore.close();
  process.exit(0);
}

process.on("SIGINT", () => void _stop());
process.on("SIGTERM", () => void _stop());
