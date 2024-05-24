import { nanoid } from '@nangohq/utils';
import type { MessageRow } from '@nangohq/types';
import { z } from 'zod';

export const operationIdRegex = z.string().regex(/([0-9]|[a-zA-Z0-9]{20})/);

export interface FormatMessageData {
    account?: { id: number; name: string };
    user?: { id: number } | undefined;
    environment?: { id: number; name: string } | undefined;
    connection?: { id: number; name: string } | undefined;
    integration?: { id: number; name: string; provider: string } | undefined;
    syncConfig?: { id: number; name: string } | undefined;
    meta?: MessageRow['meta'];
}

export function getFormattedMessage(
    data: Partial<MessageRow>,
    { account, user, environment, integration, connection, syncConfig, meta }: FormatMessageData = {}
): MessageRow {
    return {
        id: data.id || nanoid(),

        source: data.source || 'internal',
        level: data.level || 'info',
        operation: data.operation || null,
        type: data.type || 'log',
        message: data.message || '',
        title: data.title || null,
        code: data.code || null,
        state: data.state || 'waiting',

        accountId: account?.id ?? data.accountId ?? null,
        accountName: account?.name || data.accountName || null,

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

        userId: user?.id || data.userId || null,
        parentId: data.parentId || null,

        error: data.error || null,
        request: data.request || null,
        response: data.response || null,
        meta: meta || data.meta || null,

        createdAt: data.createdAt || new Date().toISOString(),
        updatedAt: data.updatedAt || new Date().toISOString(),
        startedAt: data.startedAt || null,
        endedAt: data.endedAt || null
    };
}

export const oldLevelToNewLevel = {
    debug: 'debug',
    info: 'info',
    warn: 'warn',
    error: 'error',
    verbose: 'debug',
    silly: 'debug',
    http: 'info'
} as const;
