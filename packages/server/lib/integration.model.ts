export interface Integration {
    id?: number;
    created_at?: Date;
    updated_at?: Date;
    unique_key: string;
    type: string;
    oauth_client_id?: string;
    oauth_client_secret?: string;
    oauth_scopes?: string[];
}
