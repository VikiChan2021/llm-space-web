export interface GitHubIdentity {
  providerUserId: string;
  login: string;
  displayName: string;
  avatarUrl: string | null;
  email: string | null;
}

export interface ProvisionedAccount {
  user: {
    id: string;
    login: string;
    displayName: string;
    avatarUrl: string | null;
  };
  tenant: {
    id: string;
    name: string;
  };
  workspace: {
    id: string;
    name: string;
  };
}

export interface SessionPrincipal extends ProvisionedAccount {
  sessionId: string;
  expiresAt: Date;
}

export interface CreateSessionInput {
  tokenHash: string;
  userId: string;
  tenantId: string;
  expiresAt: Date;
  userAgentHash: string | null;
  ipHash: string | null;
}

export interface CloudRepository {
  provisionGitHubIdentity(
    identity: GitHubIdentity
  ): Promise<ProvisionedAccount>;
  createSession(input: CreateSessionInput): Promise<void>;
  readSession(tokenHash: string, now: Date): Promise<SessionPrincipal | null>;
  revokeSession(tokenHash: string, now: Date): Promise<void>;
  close(): Promise<void>;
}
