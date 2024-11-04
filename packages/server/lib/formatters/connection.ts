import type { ApiConnectionFull, ApiConnectionSimple, ApiPublicConnection, DBConnection, DBEndUser } from '@nangohq/types';

export function connectionSimpleToApi({
    data,
    provider,
    activeLog,
    endUser
}: {
    data: DBConnection;
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
        endUser: endUser
            ? {
                  id: endUser.end_user_id,
                  displayName: endUser.display_name || null,
                  email: endUser.email,
                  organization: endUser.organization_id ? { id: endUser.organization_id, displayName: endUser.organization_display_name || null } : null
              }
            : null,
        created_at: String(data.created_at),
        updated_at: String(data.updated_at)
    };
}
export function connectionFullToApi(connection: DBConnection): ApiConnectionFull {
    return {
        ...connection,
        id: connection.id,
        config_id: connection.config_id,
        created_at: String(connection.created_at),
        updated_at: String(connection.updated_at)
    };
}

export function connectionToPublicApi({
    data,
    provider,
    activeLog
}: {
    data: DBConnection;
    provider: string;
    activeLog: [{ type: string; log_id: string }];
}): ApiPublicConnection {
    return {
        id: data.id,
        connection_id: data.connection_id,
        provider_config_key: data.provider_config_key,
        provider,
        errors: activeLog,
        metadata: data.metadata || null,
        created: String(data.created_at)
    };
}
