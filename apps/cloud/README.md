# LLM Space Cloud

`@llm-space/cloud` is the same-origin control plane for the Hosted Multi-User
SaaS. The first slice provides GitHub Web OAuth, opaque revocable sessions,
Personal Tenant/Workspace provisioning, PostgreSQL migrations, and forced RLS
for tenant-owned tables.

It intentionally does not expose the desktop/server filesystem, Bash, stdio
MCP, Generator, or host tool execution.

## Local configuration

Set these environment variables without committing their values:

- `CLOUD_PUBLIC_URL` — exact public origin, for example
  `http://127.0.0.1:8787`.
- `CLOUD_DATABASE_URL` — PostgreSQL connection string.
- `CLOUD_MIGRATION_DATABASE_URL` — optional schema-owner connection. Production
  should keep it separate from `CLOUD_DATABASE_URL`.
- `CLOUD_DATABASE_RUNTIME_ROLE` — optional lowercase runtime role to receive
  the minimum schema grants during migration.
- `CLOUD_SESSION_SECRET` — at least 32 bytes.
- `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` — GitHub OAuth App values.
- `CLOUD_AUTO_MIGRATE=1` — optional local convenience; production should run
  `mise run migrate:cloud` as a separate release step.

The GitHub OAuth callback is `${CLOUD_PUBLIC_URL}/auth/github/callback`.

Run migrations with `mise run migrate:cloud`, then start the control plane with
`mise run dev:cloud`.

## Security boundary

- GitHub access tokens are used only to read the authenticated identity and are
  not persisted.
- Browser sessions are random opaque values; only SHA-256 hashes are stored.
- Tenant context comes from the verified session, never a client tenant header.
- Tenant-owned tables use `ENABLE ROW LEVEL SECURITY` plus `FORCE ROW LEVEL
SECURITY`.
- Cloud startup refuses a PostgreSQL `SUPERUSER` or `BYPASSRLS` runtime role
  and verifies that every tenant table has forced RLS.
- Production must use separate migration and runtime database roles.

Set `CLOUD_TEST_DATABASE_URL` to a dedicated disposable PostgreSQL database to
run the real RLS integration test. Without it, the test is skipped and the
database boundary is not claimed as runtime-verified.

## Guest Workbench Hosted Alpha

The public Alpha intentionally bypasses login while the GitHub OAuth and BYOK
surfaces are deferred. It exposes one model-only endpoint, keeps Thread content
in browser local storage, and stores only daily HMAC quota counters on the
server.

Required server variables:

- `GUEST_PUBLIC_URL` — exact public URL including the path prefix.
- `GUEST_HMAC_SECRET` — at least 32 bytes.
- `ZHIPU_API_KEY` — server-only BigModel key.
- `GUEST_QUOTA_DATABASE_PATH` — JSON quota file used by the single Node
  process.

The optional `GUEST_*_LIMIT` variables are validated in
`src/guest-config.ts`. Defaults are 20 Runs per browser/day, 100 per IP/day,
one concurrent Run, 12,000 text characters, and 2,048 output tokens.

Use `mise run dev:guest-api` for the Bun development entrypoint and
`mise run pack:guest-api` for the Node 22 deployment bundle. Build the matching
path-based frontend with `mise run build:guest-web`.

Security boundary:

- the provider key is read from process environment only and is never returned;
- only the fixed `glm-4.7-flash` model is accepted;
- the browser receives an opaque `HttpOnly; Secure; SameSite=Lax` guest cookie;
- raw IPs, prompts, and responses are not persisted by the quota service;
- executable tools, filesystem access, stdio MCP, and Generator remain absent;
- the JSON quota store is single-process Alpha infrastructure, not a
  horizontally scalable abuse or billing system.
