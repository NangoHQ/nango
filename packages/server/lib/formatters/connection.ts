import { endUserToApi } from './endUser.js';

import type {
    ApiConnectionFull,
    ApiConnectionSimple,
    ApiPublicConnection,
    ApiPublicConnectionFull,
    DBConnection,
    DBConnectionAsJSONRow,
    DBConnectionDecrypted,
    DBEndUser
} from '@nangohq/types';

export function connectionSimpleToApi({
    data,
    provider,
    activeLog,
    endUser
}: {
    data: Omit<DBConnection | DBConnectionAsJSONRow, 'credentials'>;
    provider: string;
    activeLog: [{ type: string; log_id: string }];
    endUser: DBEndUser | null;
}): ApiConnectionSimple {
    return {
        id: data.id,
        connection_id: data.connection_id,
        provider_config_key: data.provider_config_key,
        provider,
        errors: activeLog,
        endUser: endUser ? endUserToApi(endUser) : null,
        created_at: String(data.created_at),
        updated_at: String(data.updated_at)
    };
}
export function connectionFullToApi(connection: DBConnectionDecrypted): ApiConnectionFull {
    return {
        id: connection.id,
        config_id: connection.config_id,
        environment_id: connection.environment_id,
        connection_id: connection.connection_id,
        provider_config_key: connection.provider_config_key,
        connection_config: connection.connection_config,
        credentials: connection.credentials,
        metadata: connection.metadata,
        last_fetched_at: connection.last_fetched_at ? String(connection.last_fetched_at) : null,
        credentials_expires_at: connection.credentials_expires_at ? String(connection.credentials_expires_at) : null,
        last_refresh_failure: connection.last_refresh_failure ? String(connection.last_refresh_failure) : null,
        last_refresh_success: connection.last_refresh_success ? String(connection.last_refresh_success) : null,
        refresh_attempts: connection.refresh_attempts,
        refresh_exhausted: connection.refresh_exhausted,
        created_at: String(connection.created_at),
        updated_at: String(connection.updated_at)
    };
}

export function connectionSimpleToPublicApi({
    data,
    provider,
    activeLog,
    endUser
}: {
    data: Omit<DBConnection | DBConnectionAsJSONRow, 'credentials'>;
    provider: string;
    activeLog: [{ type: string; log_id: string }];
    endUser: DBEndUser | null;
}): ApiPublicConnection {
    return {
        id: data.id,
        connection_id: data.connection_id,
        provider_config_key: data.provider_config_key,
        provider,
        errors: activeLog,
        end_user: endUser ? endUserToApi(endUser) : null,
        metadata: data.metadata || null,
        created: String(data.created_at)
    };
}

export function connectionFullToPublicApi({
    data,
    provider,
    activeLog,
    endUser
}: {
    data: (DBConnectionDecrypted | DBConnectionAsJSONRow) & { credentials: DBConnectionDecrypted['credentials'] };
    provider: string;
    activeLog: [{ type: string; log_id: string }];
    endUser: DBEndUser | null;
}): ApiPublicConnectionFull {
    return {
        id: data.id,
        connection_id: data.connection_id,
        provider_config_key: data.provider_config_key,
        provider,
        errors: activeLog,
        end_user: endUser ? endUserToApi(endUser) : null,
        metadata: data.metadata || null,
        connection_config: data.connection_config || {},
        created_at: String(data.created_at),
        updated_at: String(data.updated_at),
        last_fetched_at: data.last_fetched_at ? String(data.last_fetched_at) : null,
        credentials: data.credentials
    };
}
