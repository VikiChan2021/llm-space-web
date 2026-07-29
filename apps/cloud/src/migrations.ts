import { createHash } from "node:crypto";
import { readdir } from "node:fs/promises";
import path from "node:path";

import { SQL } from "bun";

interface MigrationRow {
  checksum: string;
}

export async function runMigrations(
  databaseUrl: string,
  runtimeRole: string | null = null
): Promise<void> {
  const sql = new SQL(databaseUrl, { max: 1 });
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS cloud_schema_migrations (
        id text PRIMARY KEY,
        checksum text NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `;
    const directory = path.resolve(import.meta.dir, "../migrations");
    const names = (await readdir(directory))
      .filter((name) => /^\d+.*\.sql$/.test(name))
      .sort();

    for (const name of names) {
      const source = await Bun.file(path.join(directory, name)).text();
      const checksum = createHash("sha256").update(source).digest("hex");
      await sql.begin(async (transaction) => {
        await transaction`SELECT pg_advisory_xact_lock(1_814_431_001)`;
        const rows = await transaction<MigrationRow[]>`
          SELECT checksum
          FROM cloud_schema_migrations
          WHERE id = ${name}
        `;
        const existing = rows[0];
        if (existing) {
          if (existing.checksum !== checksum) {
            throw new Error(`Applied migration changed: ${name}`);
          }
          return;
        }
        await transaction.unsafe(source);
        await transaction`
          INSERT INTO cloud_schema_migrations (id, checksum)
          VALUES (${name}, ${checksum})
        `;
      });
    }
    if (runtimeRole) {
      _assertRoleIdentifier(runtimeRole);
      const quotedRole = `"${runtimeRole}"`;
      await sql.unsafe(`GRANT USAGE ON SCHEMA public TO ${quotedRole}`);
      await sql.unsafe(`
        GRANT SELECT, INSERT, UPDATE, DELETE
        ON users, oauth_identities, tenants, memberships, workspaces, sessions,
           provider_connections, thread_files, usage_events, audit_events,
           deletion_jobs
        TO ${quotedRole}
      `);
      await sql.unsafe(
        `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${quotedRole}`
      );
      await sql.unsafe(`
        GRANT EXECUTE ON FUNCTION provision_github_personal_tenant(
          text,
          text,
          text,
          text,
          text
        ) TO ${quotedRole}
      `);
    }
  } finally {
    await sql.close({ timeout: 0 });
  }
}

function _assertRoleIdentifier(role: string): void {
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(role)) {
    throw new Error("Runtime database role is not a safe identifier.");
  }
}
