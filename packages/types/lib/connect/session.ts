export interface ConnectSession {
    readonly id: number;
    readonly endUserId: number;
    readonly accountId: number;
    readonly environmentId: number;
    readonly connectionId: number | null;
    readonly operationId: string | null;
    readonly allowedIntegrations: string[] | null;
    readonly integrationsConfigDefaults: Record<string, ConnectSessionIntegrationConfigDefaults> | null;
    readonly overrides: Record<string, ConnectSessionOverrides> | null;
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
