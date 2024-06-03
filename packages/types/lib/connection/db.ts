import type { TimestampsAndDeleted } from '../db.js';
import type {
    AuthCredentials,
    ApiKeyCredentials,
    BasicApiCredentials,
    AppCredentials,
    AppStoreCredentials,
    UnauthCredentials,
    CustomCredentials,
    AuthModeType,
    AuthOperationType
} from '../auth/api.js';
import type { Environment } from '../environment/db.js';
import type { Account } from '../account/db.js';

export type Metadata = Record<string, unknown>;

export type ConnectionConfig = Record<string, any>;

export interface BaseConnection extends TimestampsAndDeleted {
    id?: number;
    config_id?: number;
    provider_config_key: string; // TO deprecate
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
    credentials: AuthCredentials | ApiKeyCredentials | BasicApiCredentials | AppCredentials | AppStoreCredentials | UnauthCredentials | CustomCredentials;
}

export type RecentlyCreatedConnection = Pick<StoredConnection, 'id' | 'connection_id' | 'provider_config_key'> & {
    auth_mode: AuthModeType;
    error?: string;
    operation: AuthOperationType;
    environment: Environment;
    account: Account;
};

export interface ApiConnection {
    id?: number;
    connection_id: string;
    provider_config_key: string;
    config_id?: number;
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
    /**
     * @deprecated
     */
    account_id?: number;
}

export interface ConnectionList {
    id: number;
    connection_id: string;
    provider_config_key: string;
    provider: string;
    created: string;
    metadata?: Metadata | null;
    error_log_id?: number | string | null;
}
