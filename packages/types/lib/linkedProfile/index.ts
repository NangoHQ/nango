export interface LinkedProfile {
    readonly id: number;
    readonly profileId: string;
    readonly accountId: number;
    readonly environmentId: number;
    readonly email: string;
    readonly displayName?: string | null;
    readonly organization?: {
        readonly organizationId: string;
        readonly displayName?: string | null;
    } | null;
    readonly createdAt: Date;
    readonly updatedAt: Date | null;
}
