import type { DBAPISecret, DBEnvironment } from '../environment/db.js';
import type { DBPlan } from '../plans/db.js';
import type { DBTeam } from '../team/db.js';

export type ApiKeyAuthSource = 'customer_key' | 'sandbox_token' | 'api_secret' | 'env_var' | 'connect_session';

export interface ApiKeyPrincipal {
    type: 'api_key';
    source: ApiKeyAuthSource;
    accountId: number;
    scopes: string[];
    environmentIds: number[];
    keyId?: number;
    displayName?: string;
}

export type ApiKeyAuthorizationTarget =
    | {
          type: 'account';
          accountId: number;
      }
    | {
          type: 'environment';
          accountId: number;
          environmentId: number;
      };

export interface ApiKeyAuthDetails {
    source: Exclude<ApiKeyAuthSource, 'connect_session'>;
    scopes?: string[];
    apiKeyId?: number;
    /** Public identifier of a customer key; absent for the other auth sources, which have no key row. */
    apiKeyUuid?: string;
    apiKeyDisplayName?: string;
    purpose?: 'dryrun' | 'deploy';
    dryrunId?: string;
    deploymentId?: string;
}

export interface ApiKeyContext {
    account: DBTeam;
    environment?: DBEnvironment;
    secret?: DBAPISecret;
    plan: DBPlan | null;
    principal: ApiKeyPrincipal;
    auth: ApiKeyAuthDetails;
}
