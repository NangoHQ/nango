export interface Integration {
    id?: number;
    created_at?: Date;
    updated_at?: Date;
    name: string;
    type: string;
    oauth_client_id?: string;
    oauth_client_secret?: string;
    oauth_scopes?: string[];
}
