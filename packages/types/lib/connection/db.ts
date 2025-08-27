import type { AllAuthCredentials, AuthModeType, AuthOperationType } from '../auth/api.js';
import type { TimestampsAndDeletedCorrect } from '../db.js';
import type { EndUser } from '../endUser/index.js';
import type { DBEnvironment } from '../environment/db.js';
import type { DBTeam } from '../team/db.js';
import type { ReplaceInObject } from '../utils.js';
import type { Merge, Simplify } from 'type-fest';

export type Metadata = Record<string, unknown>;

export interface ConnectionConfig {
    [key: string]: any;
    oauth_scopes_override?: string[] | undefined;
    oauth_scopes?: string | undefined;
    authorization_params?: Record<string, string> | undefined;
}

export interface DBConnection extends TimestampsAndDeletedCorrect {
    id: number;
    config_id: number;
    end_user_id: number | null;
    /**
     * @deprecated
     */
    provider_config_key: string;
    connection_id: string;
    connection_config: ConnectionConfig;
    environment_id: number;
    metadata: Metadata | null;
    credentials: { encrypted_credentials?: string };
    credentials_iv: string | null;
    credentials_tag: string | null;
    last_fetched_at: Date | null;
    credentials_expires_at: Date | null;
    last_refresh_failure: Date | null;
    last_refresh_success: Date | null;
    refresh_attempts: number | null;
    refresh_exhausted: boolean;
}
export type DBConnectionAsJSONRow = Simplify<ReplaceInObject<DBConnection, Date, string>>;
export type DBConnectionDecrypted = Merge<DBConnection, { credentials: AllAuthCredentials }>;

export interface RecentlyCreatedConnection {
    connection: DBConnection;
    auth_mode: AuthModeType;
    error?: string;
    operation: AuthOperationType;
    environment: DBEnvironment;
    account: DBTeam;
    endUser: EndUser | undefined;
}

export interface FailedConnectionError {
    type: string;
    description: string;
}

export interface RecentlyFailedConnection {
    connection: DBConnection | Pick<DBConnection, 'connection_id' | 'provider_config_key'>;
    auth_mode: AuthModeType;
    error?: FailedConnectionError;
    operation: AuthOperationType;
    environment: DBEnvironment;
    account: DBTeam;
}

export type ConnectionInternal = Pick<DBConnection, 'id' | 'connection_id' | 'provider_config_key' | 'environment_id' | 'connection_config'>;
export type ConnectionJobs = Pick<DBConnection, 'id' | 'connection_id' | 'provider_config_key' | 'environment_id'>;
