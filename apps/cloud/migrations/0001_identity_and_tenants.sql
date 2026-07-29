CREATE EXTENSION IF NOT EXISTS pgcrypto;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name text NOT NULL,
  avatar_url text,
  email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE oauth_identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider = 'github'),
  provider_user_id text NOT NULL,
  login text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_user_id)
);

CREATE TABLE tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'personal' CHECK (kind = 'personal'),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE oauth_identities
  ADD COLUMN tenant_id uuid UNIQUE REFERENCES tenants(id) ON DELETE SET NULL;

CREATE TABLE memberships (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role = 'owner'),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, user_id)
);

CREATE TABLE workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name)
);

CREATE TABLE sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash text NOT NULL UNIQUE CHECK (length(token_hash) = 64),
  user_id uuid NOT NULL,
  tenant_id uuid NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  user_agent_hash text CHECK (
    user_agent_hash IS NULL OR length(user_agent_hash) = 64
  ),
  ip_hash text CHECK (ip_hash IS NULL OR length(ip_hash) = 64),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, user_id)
    REFERENCES memberships(tenant_id, user_id)
    ON DELETE CASCADE
);

CREATE INDEX sessions_active_token_idx
  ON sessions (token_hash, expires_at)
  WHERE revoked_at IS NULL;

CREATE TABLE provider_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  provider_type text NOT NULL,
  display_name text NOT NULL,
  encrypted_secret bytea NOT NULL,
  key_version integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE thread_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  path text NOT NULL,
  body jsonb NOT NULL,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, workspace_id, path)
);

CREATE TABLE usage_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  idempotency_key text NOT NULL,
  input_tokens bigint NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
  output_tokens bigint NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, idempotency_key)
);

CREATE TABLE audit_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE deletion_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  requested_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  requested_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  error_code text
);

CREATE OR REPLACE FUNCTION current_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
$$;

ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON tenants
  USING (id = current_tenant_id())
  WITH CHECK (id = current_tenant_id());

ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON memberships
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspaces FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON workspaces
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE provider_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_connections FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON provider_connections
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE thread_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE thread_files FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON thread_files
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE usage_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_events FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON usage_events
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON audit_events
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE deletion_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE deletion_jobs FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON deletion_jobs
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

CREATE OR REPLACE FUNCTION provision_github_personal_tenant(
  provider_user_id_input text,
  login_input text,
  display_name_input text,
  avatar_url_input text,
  email_input text
)
RETURNS TABLE (
  user_id uuid,
  tenant_id uuid,
  workspace_id uuid,
  login text,
  display_name text,
  avatar_url text,
  tenant_name text,
  workspace_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  selected_user_id uuid;
  selected_tenant_id uuid;
  selected_workspace_id uuid;
  selected_tenant_name text;
  selected_workspace_name text;
BEGIN
  IF provider_user_id_input IS NULL OR provider_user_id_input = '' THEN
    RAISE EXCEPTION 'provider_user_id is required';
  END IF;
  IF login_input IS NULL OR login_input = '' THEN
    RAISE EXCEPTION 'login is required';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended('github:' || provider_user_id_input, 0)
  );

  SELECT identity.user_id, identity.tenant_id
    INTO selected_user_id, selected_tenant_id
    FROM public.oauth_identities AS identity
    WHERE identity.provider = 'github'
      AND identity.provider_user_id = provider_user_id_input;

  IF selected_user_id IS NULL THEN
    INSERT INTO public.users (display_name, avatar_url, email)
      VALUES (display_name_input, avatar_url_input, email_input)
      RETURNING id INTO selected_user_id;
    INSERT INTO public.oauth_identities (
      user_id,
      provider,
      provider_user_id,
      login
    )
      VALUES (
        selected_user_id,
        'github',
        provider_user_id_input,
        login_input
      );
  ELSE
    UPDATE public.users
      SET display_name = display_name_input,
          avatar_url = avatar_url_input,
          email = email_input,
          updated_at = now()
      WHERE id = selected_user_id;
    UPDATE public.oauth_identities
      SET login = login_input,
          updated_at = now()
      WHERE provider = 'github'
        AND provider_user_id = provider_user_id_input;
  END IF;

  IF selected_tenant_id IS NULL THEN
    selected_tenant_id := gen_random_uuid();
    selected_tenant_name := display_name_input || '''s Space';
    PERFORM set_config(
      'app.current_tenant_id',
      selected_tenant_id::text,
      true
    );
    INSERT INTO public.tenants (id, owner_user_id, name)
      VALUES (selected_tenant_id, selected_user_id, selected_tenant_name);
  ELSE
    PERFORM set_config(
      'app.current_tenant_id',
      selected_tenant_id::text,
      true
    );
    UPDATE public.tenants
      SET updated_at = now()
      WHERE id = selected_tenant_id
      RETURNING name INTO selected_tenant_name;
  END IF;

  UPDATE public.oauth_identities
    SET tenant_id = selected_tenant_id,
        updated_at = now()
    WHERE provider = 'github'
      AND provider_user_id = provider_user_id_input;

  INSERT INTO public.memberships (tenant_id, user_id, role)
    VALUES (selected_tenant_id, selected_user_id, 'owner')
    ON CONFLICT ON CONSTRAINT memberships_pkey
      DO UPDATE SET role = 'owner';

  SELECT workspace.id, workspace.name
    INTO selected_workspace_id, selected_workspace_name
    FROM public.workspaces AS workspace
    WHERE workspace.tenant_id = selected_tenant_id
    ORDER BY workspace.created_at
    LIMIT 1;

  IF selected_workspace_id IS NULL THEN
    INSERT INTO public.workspaces (tenant_id, name)
      VALUES (selected_tenant_id, 'My Workspace')
      RETURNING id, name
      INTO selected_workspace_id, selected_workspace_name;
  END IF;

  INSERT INTO public.audit_events (
    tenant_id,
    actor_user_id,
    event_type,
    metadata
  )
    VALUES (
      selected_tenant_id,
      selected_user_id,
      'identity.github.provisioned',
      jsonb_build_object('login', login_input)
    );

  RETURN QUERY
    SELECT
      selected_user_id,
      selected_tenant_id,
      selected_workspace_id,
      login_input,
      display_name_input,
      avatar_url_input,
      selected_tenant_name,
      selected_workspace_name;
END;
$$;

REVOKE ALL ON FUNCTION provision_github_personal_tenant(
  text,
  text,
  text,
  text,
  text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION provision_github_personal_tenant(
  text,
  text,
  text,
  text,
  text
) TO CURRENT_USER;
