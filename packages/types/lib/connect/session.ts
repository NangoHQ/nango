import type { Tags } from '../db.js';
import type { InternalEndUser } from '../endUser/index.js';

export interface ConnectSession {
    readonly id: number;
    readonly endUserId: number | null;
    readonly accountId: number;
    readonly environmentId: number;
    readonly connectionId: number | null;
    readonly operationId: string | null;
    readonly allowedIntegrations: string[] | null;
    readonly integrationsConfigDefaults: Record<string, ConnectSessionIntegrationConfigDefaults> | null;
    readonly overrides: Record<string, ConnectSessionOverrides> | null;
    /** Session-level override of the environment's webhook URLs, applied to the connection created by this session. */
    readonly webhookUrlOverride: string | null;
    readonly endUser: InternalEndUser | null;
    readonly tags: Tags;
    readonly createdAt: Date;
    readonly updatedAt: Date | null;
}

export interface ConnectSessionIntegrationConfigDefaults {
    /** Only used by Slack */
    user_scopes?: string | undefined;
    authorization_params?: Record<string, string> | undefined;
    connectionConfig?:
        | {
              [key: string]: unknown;
              oauth_scopes_override?: string | undefined;
          }
        | undefined;
}

export interface ConnectSessionOverrides {
    docs_connect?: string | undefined;
}
