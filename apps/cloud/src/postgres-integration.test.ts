import { expect, test } from "bun:test";

import { SQL } from "bun";

import { hashToken, randomToken } from "./crypto";
import { runMigrations } from "./migrations";
import {
  assertRuntimeDatabaseIsolation,
  PostgresCloudRepository,
} from "./postgres-repository";

const databaseUrl = process.env.CLOUD_TEST_DATABASE_URL;
const integrationTest = databaseUrl ? test : test.skip;

integrationTest(
  "PostgreSQL RLS prevents one personal tenant from reading another",
  async () => {
    if (!databaseUrl) return;
    await runMigrations(databaseUrl);
    let unsafeRoleError: unknown;
    try {
      await assertRuntimeDatabaseIsolation(databaseUrl);
    } catch (error) {
      unsafeRoleError = error;
    }
    expect(unsafeRoleError).toBeInstanceOf(Error);
    expect((unsafeRoleError as Error).message).toContain("non-superuser");
    const suffix = randomToken(8);
    const role = `cloud_test_${suffix.toLowerCase().replaceAll("-", "_")}`;
    const password = randomToken(24);
    const admin = new SQL(databaseUrl, { max: 1 });
    await admin.unsafe(
      `CREATE ROLE "${role}" LOGIN PASSWORD '${password}' ` +
        "NOSUPERUSER NOBYPASSRLS"
    );
    await admin.close({ timeout: 0 });
    await runMigrations(databaseUrl, role);

    const runtimeUrl = new URL(databaseUrl);
    runtimeUrl.username = role;
    runtimeUrl.password = password;
    const runtimeDatabaseUrl = runtimeUrl.toString();
    await assertRuntimeDatabaseIsolation(runtimeDatabaseUrl);
    const repository = new PostgresCloudRepository(runtimeDatabaseUrl);
    const first = await repository.provisionGitHubIdentity({
      providerUserId: `integration-a-${suffix}`,
      login: `integration-a-${suffix}`,
      displayName: "Integration A",
      avatarUrl: null,
      email: null,
    });
    const second = await repository.provisionGitHubIdentity({
      providerUserId: `integration-b-${suffix}`,
      login: `integration-b-${suffix}`,
      displayName: "Integration B",
      avatarUrl: null,
      email: null,
    });
    const firstAgain = await repository.provisionGitHubIdentity({
      providerUserId: `integration-a-${suffix}`,
      login: `integration-a-${suffix}`,
      displayName: "Integration A Updated",
      avatarUrl: null,
      email: null,
    });
    expect(firstAgain.user.id).toBe(first.user.id);
    expect(firstAgain.tenant.id).toBe(first.tenant.id);
    expect(firstAgain.workspace.id).toBe(first.workspace.id);

    const sessionToken = randomToken();
    await repository.createSession({
      tokenHash: hashToken(sessionToken),
      userId: first.user.id,
      tenantId: first.tenant.id,
      expiresAt: new Date(Date.now() + 60_000),
      userAgentHash: null,
      ipHash: null,
    });
    const principal = await repository.readSession(
      hashToken(sessionToken),
      new Date()
    );
    expect(principal?.tenant.id).toBe(first.tenant.id);
    expect(principal?.workspace.id).toBe(first.workspace.id);

    const sql = new SQL(runtimeDatabaseUrl, { max: 1 });
    try {
      const visible = await sql.begin(async (transaction) => {
        await transaction`
          SELECT set_config(
            'app.current_tenant_id',
            ${first.tenant.id},
            true
          )
        `;
        return transaction<{ id: string }[]>`
          SELECT id
          FROM workspaces
          WHERE id = ${second.workspace.id}
        `;
      });
      expect(visible).toEqual([]);
    } finally {
      await sql.close({ timeout: 0 });
      await repository.close();
    }
  }
);
