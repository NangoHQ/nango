import type { estypes } from '@elastic/elasticsearch';
import { client } from '../es/client.js';
import type { MessageRow } from '../types/messages.js';
import { nanoid } from '../utils.js';
import { indexMessages } from '../es/schema.js';

/**
 * Create one message
 */
export async function createMessage(row: MessageRow): Promise<void> {
    await client.create<MessageRow>({
        index: indexMessages.index,
        id: row.id,
        document: row
    });
}

/**
 * List operations
 */
export async function listOperations(opts: { limit: number }): Promise<{ count: number; items: estypes.SearchHit<MessageRow>[] }> {
    const res = await client.search<MessageRow>({
        index: indexMessages.index,
        size: opts.limit,
        sort: [{ name: 'desc' }, '_score'],
        track_total_hits: true,
        query: {
            // @ts-expect-error I don't get the error
            bool: {
                must_not: [{ exists: { field: 'parentId' } }]
            }
        }
    });

    return {
        count: typeof res.hits.total === 'number' ? res.hits.total : res.hits.hits.length,
        items: res.hits.hits
    };
}

/**
 * Get a single operation
 */
export async function getOperation(opts: { id: MessageRow['id'] }): Promise<MessageRow | undefined> {
    const res = await client.get<MessageRow>({
        index: indexMessages.index,
        id: opts.id
    });
    return res._source;
}

export async function update(opts: { id: MessageRow['id']; data: Partial<Omit<MessageRow, 'id'>> }): Promise<void> {
    await client.update<Partial<Omit<MessageRow, 'id'>>>({
        index: indexMessages.index,
        id: opts.id,
        refresh: true,
        doc: { ...opts.data, updatedAt: new Date().toISOString() }
    });
}

/**
 * Set an operation as currently running
 */
export async function setRunning(opts: Pick<MessageRow, 'id'>): Promise<void> {
    await update({ id: opts.id, data: { state: 'running', startedAt: new Date().toISOString() } });
}

/**
 * Set an operation as finished
 */
export async function setFinish(opts: Pick<MessageRow, 'id'>): Promise<void> {
    await update({ id: opts.id, data: { state: 'running', endedAt: new Date().toISOString() } });

    // TODO: fix this
    // await db.table<OperationTable>('operations').update({
    //     state: db.raw(`CASE WHEN state = 'waiting' OR state = 'running' THEN 'success' ELSE state END`),
    //     updated_at: db.fn.now(),
    //     started_at: db.raw('COALESCE(started_at, NOW())'),
    //     ended_at: db.fn.now()
    // });
}

/**
 * Set an operation intermediate state
 */
export async function setState(opts: Pick<MessageRow, 'id' | 'state'>): Promise<void> {
    await update({ id: opts.id, data: { state: opts.state, endedAt: new Date().toISOString() } });
    // TODO: fix this
    // await db.table<OperationTable>('operations').update({ state, updated_at: db.fn.now(), started_at: db.raw('COALESCE(started_at, NOW())') });
}

/**
 * List messages
 */
export async function listMessages(opts: {
    parentId: MessageRow['parentId'];
    limit: number;
}): Promise<{ count: number; items: estypes.SearchHit<MessageRow>[] }> {
    const res = await client.search<MessageRow>({
        index: indexMessages.index,
        size: 5000,
        sort: [{ name: 'desc' }, '_score'],
        track_total_hits: true,
        query: {
            // @ts-expect-error I don't get the error
            bool: {
                must_not: [{ exists: { field: 'parentId' } }],
                must: [{ term: { parentId: opts.parentId } }]
            }
        }
    });

    return {
        count: typeof res.hits.total === 'number' ? res.hits.total : res.hits.hits.length,
        items: res.hits.hits
    };
}

export function getFormattedMessage(data: Partial<MessageRow>): MessageRow {
    return {
        id: data.id || nanoid(),

        source: data.source || 'nango',
        level: data.level || 'info',
        type: data.type || 'log',
        message: data.type || '',
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
