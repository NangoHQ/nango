import type { ApiConnection, DBConnection, DBEndUser } from '@nangohq/types';

export function connectionToApi({
    data,
    provider,
    activeLog,
    endUser
}: {
    data: DBConnection;
    provider: string;
    activeLog: [{ type: string; log_id: string }];
    endUser: DBEndUser | null;
}): ApiConnection {
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
