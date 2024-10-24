import type { ApiConnection, DBConnection } from '@nangohq/types';

export function connectionToApi(data: DBConnection, provider: string, activeLog: [{ type: string; log_id: string }]): ApiConnection {
    return {
        id: data.id,
        connection_id: data.connection_id,
        provider_config_key: data.provider_config_key,
        provider,
        errors: activeLog,
        created_at: String(data.created_at),
        updated_at: String(data.updated_at)
    };
}
