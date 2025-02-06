import { nanoid } from '@nangohq/utils';
import type { ConcatOperationList, MessageRow, MessageRowInsert, OperationRow, OperationRowInsert } from '@nangohq/types';
import { z } from 'zod';
import type { estypes } from '@elastic/elasticsearch';
import { defaultOperationExpiration } from '../env.js';
import type { LogContext } from '../client.js';

export const operationIdRegex = z.string().regex(/([0-9]|[a-zA-Z0-9]{20})/);

export interface FormatMessageData {
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
    { account, user, environment, integration, connection, syncConfig, meta }: FormatMessageData = {}
): OperationRow {
    return {
        ...getFormattedMessage(data as unknown as MessageRow),
        message: operationTypeToMessage[`${data.operation.type}:${data.operation.action}` as ConcatOperationList],
        id: data.id || nanoid(),
        operation: data.operation,

        accountId: account?.id ?? data.accountId ?? -1,
        accountName: account?.name || data.accountName || '',

        environmentId: environment?.id ?? data.environmentId ?? null,
        environmentName: environment?.name || data.environmentName || null,

        integrationId: integration?.id ?? data.integrationId ?? null,
        integrationName: integration?.name || data.integrationName || null,
        providerName: integration?.provider || data.providerName || null,

        connectionId: connection?.id ?? data.connectionId ?? null,
        connectionName: connection?.name || data.connectionName || null,

        syncConfigId: syncConfig?.id || data.syncConfigId || null,
        syncConfigName: syncConfig?.name || data.syncConfigName || null,

        jobId: data.jobId || null,
        meta: meta || data.meta || null,

        userId: user?.id || data.userId || null,
        parentId: null
    };
}
export function getFormattedMessage(data: Partial<MessageRow>, { meta }: FormatMessageData = {}): MessageRow {
    const now = new Date();
    return {
        id: data.id || nanoid(), // This ID is for debugging purpose, not for insertion

        source: data.source || 'internal',
        level: data.level || 'info',
        operation: data.operation || null,
        type: data.type || 'log',
        message: data.message || '',
        title: data.title || null,
        code: data.code || null,
        state: data.state || 'waiting',

        accountId: null,
        accountName: null,

        environmentId: null,
        environmentName: null,

        integrationId: null,
        integrationName: null,
        providerName: null,

        connectionId: null,
        connectionName: null,

        syncConfigId: null,
        syncConfigName: null,

        jobId: data.jobId || null,

        userId: null,
        parentId: data.parentId || null,

        error: data.error || null,
        request: data.request || null,
        response: data.response || null,
        meta: meta || data.meta || null,

        createdAt: data.createdAt || now.toISOString(),
        updatedAt: data.updatedAt || now.toISOString(),
        startedAt: data.startedAt || null,
        endedAt: data.endedAt || null,
        expiresAt: data.operation ? data.expiresAt || defaultOperationExpiration.sync() : null
    };
}

// TODO: remove once not used by persist anymore
export const oldLevelToNewLevel = {
    debug: 'debug',
    info: 'info',
    warn: 'warn',
    error: 'error',
    verbose: 'debug',
    silly: 'debug',
    http: 'info'
} as const;

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
    'action:run': 'Action execution',
    'admin:impersonation': 'Admin logged into another account',
    'auth:create_connection': 'Create connection',
    'auth:post_connection': 'post connection execution',
    'auth:refresh_token': 'Token refresh',
    'auth:connection_test': 'Connection test',
    'deploy:custom': 'Deploying custom scripts',
    'deploy:prebuilt': 'Deploying pre-built flow',
    'proxy:call': 'Proxy call',
    'sync:cancel': 'Sync execution canceled',
    'sync:init': 'Sync initialization',
    'sync:pause': 'Sync schedule paused',
    'sync:request_run_full': 'Sync execution triggered (full)',
    'sync:request_run': 'Sync execution triggered (incremental)',
    'sync:run': 'Sync execution',
    'sync:unpause': 'Sync schedule started',
    'webhook:incoming': 'Received a webhook',
    'webhook:forward': 'Forwarding Webhook',
    'webhook:sync': 'Delivering Webhook from Sync',
    'events:post_connection_creation': 'Post connection creation script execution',
    'events:pre_connection_deletion': 'Pre connection creation script execution'
};

/**
 * Send buffered logs to elasticsearch
 * Ultimately it would be better to have LogContextBuffer (or an option in LogContext)
 */
export async function flushLogsBuffer(logs: MessageRowInsert[], logCtx: LogContext) {
    await Promise.all(
        logs.map(async (log) => {
            await logCtx.log(log);
        })
    );
}
