import type { AuthCredentials } from './Auth.js';

export interface BaseConnection {
    id?: number;
    created_at?: Date;
    updated_at?: Date;
    provider_config_key: string;
    connection_id: string;
    connection_config: Record<string, string>;
    account_id: number;
    metadata: Record<string, string>;
    credentials_iv?: string | null;
    credentials_tag?: string | null;
}

export interface StoredConnection extends BaseConnection {
    credentials: Record<string, any>;
}

export interface Connection extends BaseConnection {
    credentials: AuthCredentials;
}
