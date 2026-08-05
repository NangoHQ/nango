import { getEncryptionManager, connectionService as sharedConnectionService } from '@nangohq/shared';
import { Err, Ok } from '@nangohq/utils';

import type { AllAuthCredentials, Metadata, Tags } from '@nangohq/types';
import type { Result } from '@nangohq/utils';

export interface ConnectionListFilters {
    environmentId: number;
    connectionId?: string | undefined;
    search?: string | undefined;
    endUserId?: string | undefined;
    integrationIds?: string[] | undefined;
    endUserOrganizationId?: string | undefined;
    tags?: Record<string, string> | undefined;
    limit?: number | undefined;
    page?: number | undefined;
    includeCredentials?: boolean | undefined;
}

export interface ListedConnectionEndUser {
    id: string;
    displayName: string | null;
    email: string | null;
    tags: Record<string, string> | null;
    organization: {
        id: string;
        displayName: string | null;
    } | null;
}

export interface ListedConnection {
    id: number;
    connectionId: string;
    integrationId: string;
    provider: string;
    createdAt: Date;
    metadata: Metadata | null;
    tags: Tags;
    errors: { type: string; logId: string }[];
    endUser: ListedConnectionEndUser | null;
    credentials?: AllAuthCredentials | undefined;
}

export class ConnectionServiceError extends Error {
    public code = 'list_failed' as const;

    constructor({ message, cause }: { message: string; cause?: unknown }) {
        super(message, { cause });
        this.name = 'ConnectionServiceError';
    }
}

export class ConnectionService {
    public async list({
        environmentId,
        connectionId,
        search,
        endUserId,
        integrationIds,
        endUserOrganizationId,
        tags,
        limit = 10_000,
        page = 0,
        includeCredentials = false
    }: ConnectionListFilters): Promise<Result<ListedConnection[], ConnectionServiceError>> {
        try {
            const connections = await sharedConnectionService.listConnections({
                environmentId,
                connectionId,
                search,
                endUserId,
                integrationIds,
                endUserOrganizationId,
                tags,
                limit,
                page
            });

            return Ok(
                connections.map(({ connection, active_logs, end_user, provider }) => ({
                    id: connection.id,
                    connectionId: connection.connection_id,
                    integrationId: connection.provider_config_key,
                    provider,
                    createdAt: new Date(connection.created_at),
                    metadata: connection.metadata,
                    tags: connection.tags,
                    errors: active_logs.map((error) => ({ type: error.type, logId: error.log_id })),
                    endUser: end_user
                        ? {
                              id: end_user.end_user_id,
                              displayName: end_user.display_name,
                              email: end_user.email,
                              tags: end_user.tags,
                              organization: end_user.organization_id
                                  ? {
                                        id: end_user.organization_id,
                                        displayName: end_user.organization_display_name
                                    }
                                  : null
                          }
                        : null,
                    ...(includeCredentials ? { credentials: getEncryptionManager().decryptConnection(connection).credentials } : {})
                }))
            );
        } catch (err) {
            return Err(
                new ConnectionServiceError({
                    message: 'Failed to list connections',
                    cause: err
                })
            );
        }
    }
}

export default new ConnectionService();
