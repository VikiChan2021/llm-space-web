import { loadCloudConfig } from "./config";
import { createGitHubOAuthClient } from "./github-oauth";
import { startCloudHttpServer } from "./http-server";
import { runMigrations } from "./migrations";
import {
  assertRuntimeDatabaseIsolation,
  PostgresCloudRepository,
} from "./postgres-repository";

const config = loadCloudConfig();
if (config.autoMigrate) {
  await runMigrations(config.migrationDatabaseUrl, config.databaseRuntimeRole);
}
await assertRuntimeDatabaseIsolation(config.databaseUrl);

const repository = new PostgresCloudRepository(config.databaseUrl);
const github = createGitHubOAuthClient({
  clientId: config.githubClientId,
  clientSecret: config.githubClientSecret,
});
const server = startCloudHttpServer({ config, github, repository });

console.info(`LLM Space Cloud listening at ${server.url.origin}`);

let stopping = false;
async function _stop(): Promise<void> {
  if (stopping) return;
  stopping = true;
  await server.stop();
  await repository.close();
  process.exit(0);
}

process.on("SIGINT", () => void _stop());
process.on("SIGTERM", () => void _stop());
