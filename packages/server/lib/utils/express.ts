import type { Principal } from '@nangohq/authz';
import type {
    AgentSession,
    ApiKeyPrincipal,
    ConnectSession,
    DBAPISecret,
    DBEnvironment,
    DBPlan,
    DBTeam,
    DBUser,
    EnvironmentWithoutSecrets,
    InternalEndUser
} from '@nangohq/types';

// Types are historically loose so we need to fix them at some point
// export type RequestLocals =
//     | {
//           authType: 'connectSession';
//           account: DBTeam;
//           environment: DBEnvironment;
//           connectSession: ConnectSession;
//           endUser: EndUser;
//       }
//     | {
//           authType: 'publicKey';
//           account: DBTeam;
//           environment: DBEnvironment;
//       }
//     | {
//           authType: 'basic' | 'session' | 'secretKey' | 'adminKey' | 'none';
//           account?: DBTeam;
//           environment?: DBEnvironment;
//           user: Pick<DBUser, 'id' | 'email' | 'name'>;
//       };

export interface RequestLocals {
    // Set by every auth path.
    authType: 'secretKey' | 'publicKey' | 'basic' | 'adminKey' | 'none' | 'session' | 'connectSession' | 'agentSession' | 'mcpOAuth' | 'taskToken';
    account: DBTeam;
    plan: DBPlan | null;

    // Asserted, not guaranteed: `connectSession` is only set by connect-session auth, `agentSession` only
    // by agent-session auth and `user` only by session auth. Enough handlers read them unguarded that
    // narrowing them is its own change.
    connectSession: ConnectSession;
    agentSession: AgentSession;
    user: DBUser;

    // Set only by some auth paths, so a handler must check before use.
    // Task-token requests carry EnvironmentWithoutSecrets: the secret columns are never loaded.
    environment?: DBEnvironment | EnvironmentWithoutSecrets;
    endUser?: InternalEndUser | null;
    lang?: string;
    secret?: DBAPISecret;
    apiKeyPrincipal?: ApiKeyPrincipal;
    principal?: Principal | null;
    apiKeyId?: number;
    apiKeyUuid?: string;
    apiKeyDisplayName?: string;
    apiKeyAuthSource?: 'customer_key' | 'sandbox_token' | 'api_secret' | 'env_var' | 'task_token';
    sandboxTokenPurpose?: 'dryrun' | 'deploy';
    sandboxTokenDryrunId?: string;
    sandboxTokenDeploymentId?: string;
}

/** RequestLocals with a full environment. Task-token routes must not use this: they have no secrets. */
export type RequestLocalsWithEnvironment = RequestLocals & { environment: DBEnvironment };

/** Task-token routes load no secret columns, so the environment is the wider type. */
export type RequestLocalsWithAnyEnvironment = RequestLocals & { environment: DBEnvironment | EnvironmentWithoutSecrets };
