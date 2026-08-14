import cloneDeepWith from 'lodash-es/cloneDeepWith.js';
import isDate from 'lodash-es/isDate.js';

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
    endUser,
    pausedSyncs
}: {
    data: Omit<DBConnection | DBConnectionAsJSONRow, 'credentials'>;
    provider: string;
    activeLog: [{ type: string; log_id: string }];
    endUser: DBEndUser | null;
    pausedSyncs: string[];
}): ApiConnectionSimple {
    return {
        id: data.id,
        config_id: data.config_id,
        connection_id: data.connection_id,
        provider_config_key: data.provider_config_key,
        provider,
        errors: activeLog,
        endUser: endUser ? endUserToApi(endUser) : null,
        tags: data.tags,
        pausedSyncs,
        created_at: String(data.created_at),
        updated_at: String(data.updated_at)
    };
}
export function connectionFullToApi(connection: DBConnectionDecrypted, options?: { includeCredentials?: boolean }): ApiConnectionFull {
    return {
        id: connection.id,
        config_id: connection.config_id,
        environment_id: connection.environment_id,
        connection_id: connection.connection_id,
        provider_config_key: connection.provider_config_key,
        connection_config: connection.connection_config,
        webhook_url_override: connection.webhook_url_override,
        credentials: options?.includeCredentials ? connection.credentials : redactCredentials(connection.credentials),
        metadata: connection.metadata,
        tags: connection.tags,
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
    activeLog: { type: string; log_id: string }[];
    endUser: DBEndUser | null;
}): ApiPublicConnection {
    return {
        id: data.id,
        connection_id: data.connection_id,
        provider_config_key: data.provider_config_key,
        provider,
        errors: activeLog,
        end_user: endUser ? endUserToApi(endUser) : null,
        tags: data.tags,
        metadata: data.metadata || null,
        created: data.created_at instanceof Date ? data.created_at.toISOString() : String(data.created_at)
    };
}

interface ConnectionFullToPublicApiArgs {
    data: Omit<DBConnectionDecrypted, 'credentials'> | Omit<DBConnectionAsJSONRow, 'credentials'>;
    credentials?: DBConnectionDecrypted['credentials'] | undefined;
    provider: string;
    activeLog: { type: string; log_id: string }[];
    endUser: DBEndUser | null;
    includeCredentials: boolean;
}

interface RetrievedConnectionToPublicApiArgs extends Omit<ConnectionFullToPublicApiArgs, 'data'> {
    data: Omit<DBConnectionDecrypted, 'credentials'>;
}

export function connectionFullToPublicApi(args: ConnectionFullToPublicApiArgs): ApiPublicConnectionFull {
    return formatConnectionFullToPublicApi(args, toApiTimestamp);
}

export function retrievedConnectionToPublicApi(args: RetrievedConnectionToPublicApiArgs): ApiPublicConnectionFull {
    return formatConnectionFullToPublicApi(args, toApiTimestampWithTimezone);
}

function formatConnectionFullToPublicApi(
    { data, credentials, provider, activeLog, endUser, includeCredentials }: ConnectionFullToPublicApiArgs,
    toTimestamp: (date: Date | string) => string
): ApiPublicConnectionFull {
    return {
        id: data.id,
        connection_id: data.connection_id,
        provider_config_key: data.provider_config_key,
        provider,
        errors: activeLog,
        end_user: endUser ? endUserToApi(endUser) : null,
        tags: data.tags,
        metadata: data.metadata || null,
        connection_config: data.connection_config || {},
        webhook_url_override: data.webhook_url_override ?? null,
        created_at: toTimestamp(data.created_at),
        updated_at: toTimestamp(data.updated_at),
        last_fetched_at: data.last_fetched_at ? toTimestamp(data.last_fetched_at) : null,
        credentials: credentialsToPublicApi(credentials, includeCredentials)
    };
}

function credentialsToPublicApi(
    credentials: DBConnectionDecrypted['credentials'] | undefined,
    includeCredentials: boolean
): ApiPublicConnectionFull['credentials'] {
    if (!includeCredentials || !credentials) {
        return {};
    }

    return cloneDeepWith(credentials, (value) => {
        if (isDate(value)) {
            return value.toISOString();
        }
        return undefined;
    });
}

function toApiTimestamp(date: Date | string): string {
    return date instanceof Date ? date.toISOString() : date;
}

function toApiTimestampWithTimezone(date: Date | string): string {
    return date instanceof Date ? date.toISOString().replace('Z', '+00:00') : date;
}

const NON_SENSITIVE_KEYS = new Set(['type', 'expires_at']);

function redactValue(value: unknown): unknown {
    if (value === null || value === undefined) {
        return value;
    }
    if (Array.isArray(value)) {
        return value.map(redactValue);
    }
    if (typeof value === 'object') {
        return redactObject(value as Record<string, unknown>);
    }
    return 'REDACTED';
}

function redactObject(obj: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
        result[key] = NON_SENSITIVE_KEYS.has(key) ? value : redactValue(value);
    }
    return result;
}

export function redactCredentials(credentials: DBConnectionDecrypted['credentials']): DBConnectionDecrypted['credentials'] {
    return redactObject(credentials as Record<string, unknown>) as DBConnectionDecrypted['credentials'];
}
