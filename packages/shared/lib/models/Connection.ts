import type { AuthCredentials, ApiKeyCredentials, BasicApiCredentials } from './Auth.js';

export interface BaseConnection {
    id?: number;
    created_at?: Date;
    updated_at?: Date;
    provider_config_key: string;
    connection_id: string;
    connection_config: Record<string, string>;
    environment_id: number;
    metadata?: Record<string, string>;
    credentials_iv?: string | null;
    credentials_tag?: string | null;
    field_mappings?: Record<string, string>;
}

export interface StoredConnection extends BaseConnection {
    credentials: Record<string, any>;
}

export interface Connection extends BaseConnection {
    credentials: AuthCredentials | ApiKeyCredentials | BasicApiCredentials;
}

export interface ApiConnection {
    id?: number;
    connection_id: string;
    provider_config_key: string;
    environment_id: number;
    connection_config: Record<string, string>;
    credentials_iv?: string | null;
    credentials_tag?: string | null;
    credentials: BasicApiCredentials | ApiKeyCredentials;
}

export interface NangoConnection {
    id?: number;
    connection_id: string;
    provider_config_key: string;
    environment_id: number;

    // TODO legacy while the migration is in progress
    account_id?: number;
}
