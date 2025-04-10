import { z } from 'zod';

import { nanoid } from '@nangohq/utils';

import { defaultOperationExpiration } from '../env.js';

import type { estypes } from '@elastic/elasticsearch';
import type { ConcatOperationList, MessageRow, OperationRow, OperationRowInsert } from '@nangohq/types';
import type { SetRequired } from 'type-fest';

export const operationIdRegex = z.string().regex(/^[a-zA-Z0-9_]{20,25}$/);

export interface AdditionalOperationData {
    account?: { id: number; name: string };
    user?: { id: number } | undefined;
    environment?: { id: number; name: string } | undefined;
    connection?: { id: number; name: string } | undefined;
    integration?: { id: number; name: string; provider: string } | undefined;
    syncConfig?: { id: number; name: string } | undefined; // TODO: rename to script or something similar because it also apply to actions and on-events scripts
    meta?: MessageRow['meta'];
}

export function getFormattedOperation(
    data: OperationRowInsert,
    { account, user, environment, integration, connection, syncConfig, meta }: AdditionalOperationData = {}
): OperationRow {
    const now = new Date();
    const createdAt = data.createdAt ? new Date(data.createdAt) : now;
    return {
        message: operationTypeToMessage[`${data.operation.type}:${data.operation.action}` as ConcatOperationList],
        id: data.id || `${createdAt.getTime()}_${nanoid(8)}`,
        operation: data.operation,
        state: data.state || 'waiting',
        source: 'internal',
        level: data.level || 'info',
        type: 'operation',

        accountId: account?.id ?? data.accountId ?? -1,
        accountName: account?.name || data.accountName || '',

        environmentId: environment?.id ?? data.environmentId ?? undefined,
        environmentName: environment?.name || data.environmentName || undefined,

        integrationId: integration?.id ?? data.integrationId ?? undefined,
        integrationName: integration?.name || data.integrationName || undefined,
        providerName: integration?.provider || data.providerName || undefined,

        connectionId: connection?.id ?? data.connectionId ?? undefined,
        connectionName: connection?.name || data.connectionName || undefined,

        syncConfigId: syncConfig?.id || data.syncConfigId || undefined,
        syncConfigName: syncConfig?.name || data.syncConfigName || undefined,

        jobId: data.jobId || undefined,
        meta: meta || data.meta || undefined,

        userId: user?.id || data.userId || undefined,

        createdAt: data.createdAt || now.toISOString(),
        updatedAt: data.updatedAt || now.toISOString(),
        startedAt: data.startedAt || null,
        endedAt: data.endedAt || null,
        expiresAt: data.expiresAt || defaultOperationExpiration.sync()
    };
}
export function getFormattedMessage(data: SetRequired<Partial<MessageRow>, 'parentId'>): MessageRow {
    const now = new Date();
    return {
        id: data.id || nanoid(),

        source: data.source || 'internal',
        level: data.level || 'info',
        type: data.type || 'log',
        message: data.message || '',
        context: data.context,

        parentId: data.parentId,

        error: data.error,
        request: data.request,
        response: data.response,
        retry: data.retry,
        meta: data.meta,
        persistResults: data.persistResults,

        createdAt: data.createdAt || now.toISOString(),
        endedAt: data.endedAt,
        durationMs: data.durationMs
    };
}

export function getFullIndexName(prefix: string, createdAt: string) {
    return `${prefix}.${new Date(createdAt).toISOString().split('T')[0]}`;
}

export function createCursor({ sort }: estypes.SearchHit): string {
    return Buffer.from(JSON.stringify(sort)).toString('base64');
}

export function parseCursor(str: string): any[] {
    return JSON.parse(Buffer.from(str, 'base64').toString('utf8'));
}

export const operationTypeToMessage: Record<ConcatOperationList, string> = {
    'action:run': 'Action',
    'admin:impersonation': 'Admin logged into another account',
    'auth:create_connection': 'Connection created',
    'auth:post_connection': 'post connection execution',
    'auth:refresh_token': 'Token refreshed',
    'auth:connection_test': 'Connection test',
    'deploy:custom': 'Deploys',
    'deploy:prebuilt': 'Deploys',
    'proxy:call': 'Proxy',
    'sync:cancel': 'Sync execution canceled',
    'sync:init': 'Sync initialized',
    'sync:pause': 'Sync schedule paused',
    'sync:request_run_full': 'Full execution triggered',
    'sync:request_run': 'Incremental execution triggered',
    'sync:run': 'Sync executed',
    'sync:unpause': 'Sync schedule resumed',
    'webhook:incoming': 'External webhook executed',
    'webhook:forward': 'External webhook forwarded',
    'webhook:sync': 'Sync completion webhooks',
    'webhook:connection_create': 'Connection creation webhooks',
    'webhook:connection_refresh': 'Token refresh webhooks',
    'events:post_connection_creation': 'Event-based executions',
    'events:pre_connection_deletion': 'Event-based executions'
};
