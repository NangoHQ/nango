import type { AuthModes, AppStoreCredentials, AuthCredentials, ApiKeyCredentials, BasicApiCredentials, AppCredentials, AuthOperation } from './Auth.js';
import type { TimestampsAndDeleted } from './Generic.js';

export type Metadata = Record<string, string | Record<string, any>>;

export type ConnectionConfig = Record<string, any>;

export interface BaseConnection extends TimestampsAndDeleted {
    id?: number;
    provider_config_key: string;
    connection_id: string;
    connection_config: ConnectionConfig;
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
    credentials: AuthCredentials | ApiKeyCredentials | BasicApiCredentials | AppCredentials | AppStoreCredentials;
}

export type RecentlyCreatedConnection = Pick<StoredConnection, 'id' | 'connection_id' | 'provider_config_key' | 'environment_id'> & {
    auth_mode: AuthModes;
    error?: string;
    operation: AuthOperation;
};

export interface ApiConnection {
    id?: number;
    connection_id: string;
    provider_config_key: string;
    environment_id: number;
    connection_config: ConnectionConfig;
    credentials_iv?: string | null;
    credentials_tag?: string | null;
    credentials: BasicApiCredentials | ApiKeyCredentials;
}

export interface NangoConnection {
    id?: number;
    connection_id: string;
    provider_config_key: string;
    environment_id: number;
    connection_config?: ConnectionConfig;

    // TODO legacy while the migration is in progress
    account_id?: number;
}

export interface ConnectionList {
    id: number;
    connection_id: string;
    provider_config_key: string;
    provider: string;
    created: string;
    metadata?: Metadata | null;
}
