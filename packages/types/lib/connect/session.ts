export interface ConnectSession {
    readonly id: number;
    readonly endUserId: number;
    readonly accountId: number;
    readonly environmentId: number;
    readonly allowedIntegrations?: string[] | null;
    readonly integrationsConfigDefaults?: Record<
        string,
        {
            connectionConfig: {
                [key: string]: unknown;
                oauth_scopes?: string | undefined;
            };
        }
    > | null;
    readonly createdAt: Date;
    readonly updatedAt: Date | null;
}
