import { nanoid } from '@nangohq/utils';
import type { MessageRow } from '@nangohq/types';
import { z } from 'zod';
import type { estypes } from '@elastic/elasticsearch';

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
    const now = new Date();
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

        createdAt: data.createdAt || now.toISOString(),
        updatedAt: data.updatedAt || now.toISOString(),
        startedAt: data.startedAt || null,
        endedAt: data.endedAt || null,
        expiresAt: data.operation ? data.expiresAt || new Date(now.getTime() + 7 * 86400 * 1000).toISOString() : null
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

export function getFullIndexName(prefix: string, createdAt: string) {
    return `${prefix}.${new Date(createdAt).toISOString().split('T')[0]}`;
}

export function createCursor({ sort }: estypes.SearchHit): string {
    return Buffer.from(JSON.stringify(sort)).toString('base64');
}

export function parseCursor(str: string): any[] {
    return JSON.parse(Buffer.from(str, 'base64').toString('utf8'));
}
