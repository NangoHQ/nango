import type { MessageRow } from '../types/messages';
import { nanoid } from '../utils.js';

export function getFormattedMessage(data: Partial<MessageRow>): MessageRow {
    return {
        id: data.id || nanoid(),

        source: data.source || 'internal',
        level: data.level || 'info',
        type: data.type || 'log',
        message: data.message || '',
        title: data.title || null,
        code: data.code || null,
        state: data.state || 'waiting',

        accountId: data.accountId || null,
        accountName: data.accountName || null,

        environmentId: data.environmentId || null,
        environmentName: data.environmentName || null,

        configId: data.configId || null,
        configName: data.configName || null,

        connectionId: data.connectionId || null,
        connectionName: data.connectionName || null,

        syncId: data.syncId || null,
        syncName: data.syncName || null,

        jobId: data.jobId || null,

        userId: data.userId || null,
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
