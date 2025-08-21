export interface EndUser {
    id: number;
    endUserId: string;
    accountId: number;
    environmentId: number;
    email: string | null;
    displayName?: string | null;
    tags: Record<string, string> | null;
    organization?: {
        organizationId: string;
        displayName?: string | null;
    } | null;
    createdAt: Date;
    updatedAt: Date | null;
}

export interface DBEndUser {
    id: number;
    end_user_id: string;
    account_id: number;
    environment_id: number;
    email: string | null;
    display_name: string | null;
    organization_id: string | null;
    organization_display_name: string | null;
    tags: Record<string, string> | null;
    created_at: Date;
    updated_at: Date | null;
}
export type DBInsertEndUser = Omit<DBEndUser, 'id' | 'created_at' | 'updated_at'>;

export interface ApiEndUser {
    id: string;
    display_name: string | null;
    email: string | null;
    tags: Record<string, string> | null;
    organization: {
        id: string;
        display_name: string | null;
    } | null;
}
