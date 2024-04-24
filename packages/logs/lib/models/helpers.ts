import { nanoid } from '@nangohq/utils';
import type { MessageRow } from '../types/messages';

export interface FormatMessageData {
    account?: { id: number; name?: string };
    user?: { id: number } | undefined;
    environment?: { id: number; name?: string } | undefined;
    connection?: { id: number; name?: string } | undefined;
    config?: { id: number; name?: string } | undefined;
    sync?: { id: string; name?: string } | undefined;
}

export function getFormattedMessage(data: Partial<MessageRow>, { account, user, environment, config, connection, sync }: FormatMessageData = {}): MessageRow {
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

        accountId: account?.id || data.accountId || null,
        accountName: account?.name || data.accountName || null,

        environmentId: environment?.id || data.environmentId || null,
        environmentName: environment?.name || data.environmentName || null,

        configId: config?.id || data.configId || null,
        configName: config?.name || data.configName || null,

        connectionId: connection?.id || data.connectionId || null,
        connectionName: connection?.name || data.connectionName || null,

        syncId: sync?.id || data.syncId || null,
        syncName: sync?.name || data.syncName || null,

        jobId: data.jobId || null,

        userId: user?.id || data.userId || null,
        parentId: data.parentId || null,

        error: data.error || null,
        request: data.request || null,
        response: data.response || null,
        meta: data.meta || null,

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
