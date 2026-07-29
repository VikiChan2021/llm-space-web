import { SQL } from "bun";

import type {
  CloudRepository,
  CreateSessionInput,
  GitHubIdentity,
  ProvisionedAccount,
  SessionPrincipal,
} from "./types";

interface ProvisionRow {
  user_id: string;
  tenant_id: string;
  workspace_id: string;
  login: string;
  display_name: string;
  avatar_url: string | null;
  tenant_name: string;
  workspace_name: string;
}

interface SessionRow {
  session_id: string;
  user_id: string;
  tenant_id: string;
  expires_at: Date | string;
  login: string;
  display_name: string;
  avatar_url: string | null;
}

interface WorkspaceRow {
  id: string;
  name: string;
  tenant_name: string;
}

interface RuntimeRoleRow {
  rolname: string;
  rolsuper: boolean;
  rolbypassrls: boolean;
}

interface RlsTableRow {
  relname: string;
  relrowsecurity: boolean;
  relforcerowsecurity: boolean;
}

const TENANT_TABLES = [
  "audit_events",
  "deletion_jobs",
  "memberships",
  "provider_connections",
  "tenants",
  "thread_files",
  "usage_events",
  "workspaces",
] as const;

export async function assertRuntimeDatabaseIsolation(
  databaseUrl: string
): Promise<void> {
  const sql = new SQL(databaseUrl, { max: 1 });
  try {
    const roles = await sql<RuntimeRoleRow[]>`
      SELECT rolname, rolsuper, rolbypassrls
      FROM pg_roles
      WHERE rolname = current_user
    `;
    const role = roles[0];
    if (!role || role.rolsuper || role.rolbypassrls) {
      throw new Error(
        "CLOUD_DATABASE_URL must use a non-superuser role without BYPASSRLS."
      );
    }
    const tables = await sql<RlsTableRow[]>`
      SELECT
        class.relname,
        class.relrowsecurity,
        class.relforcerowsecurity
      FROM pg_class AS class
      JOIN pg_namespace AS namespace
        ON namespace.oid = class.relnamespace
      WHERE namespace.nspname = 'public'
        AND class.relname IN ${sql(TENANT_TABLES)}
    `;
    const safeTables = new Set(
      tables
        .filter((table) => table.relrowsecurity && table.relforcerowsecurity)
        .map((table) => table.relname)
    );
    const unsafeTables = TENANT_TABLES.filter(
      (table) => !safeTables.has(table)
    );
    if (unsafeTables.length > 0) {
      throw new Error(
        `Tenant RLS is not forced for: ${unsafeTables.join(", ")}.`
      );
    }
  } finally {
    await sql.close({ timeout: 0 });
  }
}

export class PostgresCloudRepository implements CloudRepository {
  private readonly _sql: SQL;

  constructor(databaseUrl: string) {
    this._sql = new SQL(databaseUrl, { max: 10 });
  }

  async provisionGitHubIdentity(
    identity: GitHubIdentity
  ): Promise<ProvisionedAccount> {
    const rows = await this._sql<ProvisionRow[]>`
      SELECT *
      FROM provision_github_personal_tenant(
        ${identity.providerUserId},
        ${identity.login},
        ${identity.displayName},
        ${identity.avatarUrl},
        ${identity.email}
      )
    `;
    const row = rows[0];
    if (!row) throw new Error("GitHub identity provisioning returned no row.");
    return {
      user: {
        id: row.user_id,
        login: row.login,
        displayName: row.display_name,
        avatarUrl: row.avatar_url,
      },
      tenant: {
        id: row.tenant_id,
        name: row.tenant_name,
      },
      workspace: {
        id: row.workspace_id,
        name: row.workspace_name,
      },
    };
  }

  async createSession(input: CreateSessionInput): Promise<void> {
    await this._sql`
      INSERT INTO sessions (
        token_hash,
        user_id,
        tenant_id,
        expires_at,
        user_agent_hash,
        ip_hash
      )
      VALUES (
        ${input.tokenHash},
        ${input.userId},
        ${input.tenantId},
        ${input.expiresAt},
        ${input.userAgentHash},
        ${input.ipHash}
      )
    `;
  }

  async readSession(
    tokenHash: string,
    now: Date
  ): Promise<SessionPrincipal | null> {
    const rows = await this._sql<SessionRow[]>`
      SELECT
        session.id AS session_id,
        session.user_id,
        session.tenant_id,
        session.expires_at,
        identity.login,
        app_user.display_name,
        app_user.avatar_url
      FROM sessions AS session
      JOIN users AS app_user ON app_user.id = session.user_id
      JOIN oauth_identities AS identity
        ON identity.user_id = session.user_id
        AND identity.provider = 'github'
        AND identity.tenant_id = session.tenant_id
      WHERE session.token_hash = ${tokenHash}
        AND session.revoked_at IS NULL
        AND session.expires_at > ${now}
      LIMIT 1
    `;
    const session = rows[0];
    if (!session) return null;

    return this._sql.begin(async (transaction) => {
      await transaction`
        SELECT set_config(
          'app.current_tenant_id',
          ${session.tenant_id},
          true
        )
      `;
      const workspaces = await transaction<WorkspaceRow[]>`
        SELECT
          workspace.id,
          workspace.name,
          tenant.name AS tenant_name
        FROM workspaces AS workspace
        JOIN tenants AS tenant ON tenant.id = workspace.tenant_id
        WHERE workspace.tenant_id = ${session.tenant_id}
        ORDER BY workspace.created_at
        LIMIT 1
      `;
      const workspace = workspaces[0];
      if (!workspace) return null;
      await transaction`
        UPDATE sessions
        SET last_seen_at = ${now}
        WHERE id = ${session.session_id}
      `;
      return {
        sessionId: session.session_id,
        expiresAt: new Date(session.expires_at),
        user: {
          id: session.user_id,
          login: session.login,
          displayName: session.display_name,
          avatarUrl: session.avatar_url,
        },
        tenant: {
          id: session.tenant_id,
          name: workspace.tenant_name,
        },
        workspace: {
          id: workspace.id,
          name: workspace.name,
        },
      };
    });
  }

  async revokeSession(tokenHash: string, now: Date): Promise<void> {
    await this._sql`
      UPDATE sessions
      SET revoked_at = ${now}
      WHERE token_hash = ${tokenHash}
        AND revoked_at IS NULL
    `;
  }

  async close(): Promise<void> {
    await this._sql.close({ timeout: 0 });
  }
}
