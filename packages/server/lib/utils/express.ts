import type { Principal } from '@nangohq/authz';
import type { AgentSession, ApiKeyPrincipal, ConnectSession, DBAPISecret, DBEnvironment, DBPlan, DBTeam, DBUser, InternalEndUser } from '@nangohq/types';

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
    authType: 'secretKey' | 'publicKey' | 'basic' | 'adminKey' | 'none' | 'session' | 'connectSession' | 'agentSession';
    account: DBTeam;
    plan: DBPlan | null;

    // Asserted, not guaranteed: `connectSession` is only set by connect-session auth, `agentSession` only
    // by agent-session auth and `user` only by session auth. Enough handlers read them unguarded that
    // narrowing them is its own change.
    connectSession: ConnectSession;
    agentSession: AgentSession;
    user: DBUser;

    // Set only by some auth paths, so a handler must check before use.
    environment?: DBEnvironment;
    endUser?: InternalEndUser | null;
    lang?: string;
    secret?: DBAPISecret;
    apiKeyPrincipal?: ApiKeyPrincipal;
    principal?: Principal | null;
    apiKeyId?: number;
    apiKeyUuid?: string;
    apiKeyDisplayName?: string;
    apiKeyAuthSource?: 'customer_key' | 'sandbox_token' | 'api_secret' | 'env_var';
    sandboxTokenPurpose?: 'dryrun' | 'deploy';
    sandboxTokenDryrunId?: string;
    sandboxTokenDeploymentId?: string;
}

/** RequestLocals with the environment confirmed present — see `asyncWrapperWithEnvironment` and `requireEnvironment`. */
export type RequestLocalsWithEnvironment = RequestLocals & { environment: DBEnvironment };
