import type { RetrievedConnection } from '../../../services/connectionRetrieval.service.js';
import type { McpConnection, McpConnectionFull } from './schema.js';
import type { connectionService } from '@nangohq/shared';

export function connectionToMcp({
    connection,
    provider,
    active_logs,
    end_user
}: Awaited<ReturnType<typeof connectionService.listConnections>>[number]): McpConnection {
    return {
        id: connection.id,
        connection_id: connection.connection_id,
        provider_config_key: connection.provider_config_key,
        provider,
        created: new Date(connection.created_at).toISOString(),
        metadata: connection.metadata,
        tags: connection.tags,
        errors: active_logs,
        end_user: end_user
            ? {
                  id: end_user.end_user_id,
                  display_name: end_user.display_name,
                  email: end_user.email,
                  tags: end_user.tags,
                  organization: end_user.organization_id
                      ? {
                            id: end_user.organization_id,
                            display_name: end_user.organization_display_name
                        }
                      : null
              }
            : null
    };
}

export function retrievedConnectionToMcp({ connection, credentials, provider, activeLogs, endUser }: RetrievedConnection): McpConnectionFull {
    return {
        id: connection.id,
        connection_id: connection.connection_id,
        provider_config_key: connection.provider_config_key,
        provider,
        connection_config: connection.connection_config,
        webhook_url_override: connection.webhook_url_override,
        created_at: new Date(connection.created_at).toISOString(),
        updated_at: new Date(connection.updated_at).toISOString(),
        last_fetched_at: connection.last_fetched_at ? new Date(connection.last_fetched_at).toISOString() : null,
        metadata: connection.metadata,
        tags: connection.tags,
        errors: activeLogs,
        end_user: endUser
            ? {
                  id: endUser.end_user_id,
                  display_name: endUser.display_name,
                  email: endUser.email,
                  tags: endUser.tags,
                  organization: endUser.organization_id
                      ? {
                            id: endUser.organization_id,
                            display_name: endUser.organization_display_name
                        }
                      : null
              }
            : null,
        ...(credentials ? { credentials: datesToIsoStrings(credentials) as Record<string, unknown> } : {})
    };
}

function datesToIsoStrings(value: unknown): unknown {
    if (value instanceof Date) {
        return value.toISOString();
    }
    if (Array.isArray(value)) {
        return value.map(datesToIsoStrings);
    }
    if (value && typeof value === 'object') {
        return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, datesToIsoStrings(child)]));
    }
    return value;
}
