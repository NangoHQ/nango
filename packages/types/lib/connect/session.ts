export interface ConnectSession {
    readonly id: number;
    readonly endUserId: number;
    readonly accountId: number;
    readonly environmentId: number;
    readonly connectionId: number | null;
    readonly allowedIntegrations: string[] | null;
    readonly integrationsConfigDefaults: Record<
        string,
        {
            /** Only used by Slack */
            user_scopes?: string | undefined;
            connectionConfig: {
                [key: string]: unknown;
                oauth_scopes_override?: string | undefined;
            };
        }
    > | null;
    readonly createdAt: Date;
    readonly updatedAt: Date | null;
}
