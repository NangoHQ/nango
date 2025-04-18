export interface EndUser {
    readonly id: number;
    readonly endUserId: string;
    readonly accountId: number;
    readonly environmentId: number;
    readonly email: string | null;
    readonly displayName?: string | null;
    readonly organization?: {
        readonly organizationId: string;
        readonly displayName?: string | null;
    } | null;
    readonly createdAt: Date;
    readonly updatedAt: Date | null;
}

export interface DBEndUser {
    readonly id: number;
    readonly end_user_id: string;
    readonly account_id: number;
    readonly environment_id: number;
    readonly email: string | null;
    readonly display_name: string | null;
    readonly organization_id: string | null;
    readonly organization_display_name: string | null;
    readonly created_at: Date;
    readonly updated_at: Date | null;
}
export type DBInsertEndUser = Omit<DBEndUser, 'id' | 'created_at' | 'updated_at'>;

export interface ApiEndUser {
    id: string;
    display_name: string | null;
    email: string | null;
    organization: {
        id: string;
        display_name: string | null;
    } | null;
}
