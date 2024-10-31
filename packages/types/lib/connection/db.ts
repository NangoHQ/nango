import type { TimestampsAndDeleted } from '../db.js';
import type { AuthModeType, AuthOperationType, AllAuthCredentials } from '../auth/api.js';
import type { DBEnvironment } from '../environment/db.js';
import type { DBTeam } from '../team/db.js';
import type { Merge } from 'type-fest';

export type Metadata = Record<string, unknown>;

export type ConnectionConfig = Record<string, any>;

export interface BaseConnection extends TimestampsAndDeleted {
    id?: number;
    config_id?: number;
    end_user_id: number | null;
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

// TODO: fix BaseConnection directly
export type DBConnection = Merge<BaseConnection, { id: number; config_id: number; credentials: Record<string, any> }>;

export interface Connection extends BaseConnection {
    credentials: AllAuthCredentials;
}

export type RecentlyCreatedConnection = Pick<StoredConnection, 'id' | 'connection_id' | 'provider_config_key'> & {
    auth_mode: AuthModeType;
    error?: string;
    operation: AuthOperationType;
    environment: DBEnvironment;
    account: DBTeam;
};

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
