import { loadCloudMigrationConfig } from "./config";
import { runMigrations } from "./migrations";

const config = loadCloudMigrationConfig();
await runMigrations(config.migrationDatabaseUrl, config.databaseRuntimeRole);
console.info("Cloud migrations are up to date.");
