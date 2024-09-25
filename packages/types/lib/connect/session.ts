export interface ConnectSessionToken {
    readonly token: string;
    readonly expiresAt: Date;
}

export interface ConnectSession {
    readonly id: number;
    readonly linkedProfileId: number;
    readonly accountId: number;
    readonly environmentId: number;
    readonly allowedIntegrations?: string[] | null;
    readonly integrationsConfigDefaults?: Record<string, { connectionConfig: Record<string, unknown> }> | null;
    readonly createdAt: Date;
    readonly updatedAt: Date | null;
}
