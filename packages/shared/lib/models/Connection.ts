import type { AuthCredentials, ApiKeyCredentials, BasicApiCredentials } from './Auth.js';
import type { TimestampsAndDeleted } from './Generic.js';

export interface Metadata {
    fieldMapping: Record<string, string>;
    [key: string]: string | Record<string, string>;
}

export interface BaseConnection extends TimestampsAndDeleted {
    id?: number;
    provider_config_key: string;
    connection_id: string;
    connection_config: Record<string, string>;
    environment_id: number;
    metadata?: Metadata | null;
    credentials_iv?: string | null;
    credentials_tag?: string | null;
    last_fetched_at?: Date | null;
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

export interface ConnectionList {
    id: number;
    connectionId: number;
    providerConfigKey: string;
    provider: string;
    creationDate: string;
}
