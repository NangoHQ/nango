import type { MessageRow } from '../types/messages';
import { nanoid } from '../utils.js';

export interface FormatMessageData {
    account?: { id: number; name: string };
    user?: { id: number } | undefined;
    environment?: { id: number; name?: string } | undefined;
}

export function getFormattedMessage(data: Partial<MessageRow>, { account, user, environment }: FormatMessageData = {}): MessageRow {
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

        configId: data.configId || null,
        configName: data.configName || null,

        connectionId: data.connectionId || null,
        connectionName: data.connectionName || null,

        syncId: data.syncId || null,
        syncName: data.syncName || null,

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

export const syncCommandToOperation = {
    PAUSE: 'pause',
    UNPAUSE: 'unpause',
    RUN: 'run',
    RUN_FULL: 'run_full',
    CANCEL: 'cancel'
} as const;
