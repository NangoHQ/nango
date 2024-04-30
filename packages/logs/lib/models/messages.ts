import { client } from '../es/client.js';
import type { MessageRow, OperationRow } from '@nangohq/types';
import { indexMessages } from '../es/schema.js';
import type { opensearchtypes } from '@opensearch-project/opensearch';

export interface ListOperations {
    count: number;
    items: OperationRow[];
}
export interface ListMessages {
    count: number;
    items: MessageRow[];
}

/**
 * Create one message
 */
export async function createMessage(row: MessageRow): Promise<void> {
    await client.create<MessageRow>({
        index: indexMessages.index,
        id: row.id,
        body: row,
        refresh: true
    });
}

/**
 * List operations
 */
export async function listOperations(opts: { accountId: number; environmentId?: number; limit: number }): Promise<ListOperations> {
    const q: opensearchtypes.QueryDslQueryContainer = {
        bool: {
            must: [{ term: { accountId: opts.accountId } }],
            must_not: { exists: { field: 'parentId' } },
            should: []
        }
    };
    if (opts.environmentId && Array.isArray(q.bool?.must)) {
        q.bool.must.push({ term: { environmentId: opts.environmentId } });
    }

    const res = await client.search<{ hits: { total: number; hits: { _source: MessageRow }[] } }>({
        index: indexMessages.index,
        size: opts.limit,
        sort: ['createdAt:desc', '_score'],
        track_total_hits: true,
        body: { query: q }
    });
    const hits = res.body.hits;

    return {
        count: typeof hits.total === 'number' ? hits.total : hits.hits.length,
        items: hits.hits.map((hit) => {
            return hit._source;
        })
    };
}

/**
 * Get a single operation
 */
export async function getOperation(opts: { id: MessageRow['id'] }): Promise<MessageRow | undefined> {
    const res = await client.get<{ id: string; _source: MessageRow }>({
        index: indexMessages.index,
        id: opts.id
    });
    return res.body._source;
}

/**
 * Update a row (can be a partial update)
 */
export async function update(opts: { id: MessageRow['id']; data: Partial<Omit<MessageRow, 'id'>> }): Promise<void> {
    await client.update<Partial<Omit<MessageRow, 'id'>>>({
        index: indexMessages.index,
        id: opts.id,
        refresh: true,
        body: {
            doc: {
                ...opts.data,
                updatedAt: new Date().toISOString()
            }
        }
    });
}

/**
 * Set an operation as currently running
 */
export async function setRunning(opts: Pick<MessageRow, 'id'>): Promise<void> {
    await update({ id: opts.id, data: { state: 'running', startedAt: new Date().toISOString() } });
}

/**
 * Set an operation as success
 */
export async function setSuccess(opts: Pick<MessageRow, 'id'>): Promise<void> {
    await update({ id: opts.id, data: { state: 'success', endedAt: new Date().toISOString() } });
}

/**
 * Set an operation as failed
 */
export async function setFailed(opts: Pick<MessageRow, 'id'>): Promise<void> {
    await update({ id: opts.id, data: { state: 'failed', endedAt: new Date().toISOString() } });
}

/**
 * Set an operation as failed
 */
export async function setCancelled(opts: Pick<MessageRow, 'id'>): Promise<void> {
    await update({ id: opts.id, data: { state: 'cancelled', endedAt: new Date().toISOString() } });
}

/**
 * Set an operation as timeout
 */
export async function setTimeouted(opts: Pick<MessageRow, 'id'>): Promise<void> {
    await update({ id: opts.id, data: { state: 'timeout', endedAt: new Date().toISOString() } });
}

/**
 * List messages
 */
export async function listMessages(opts: { parentId: MessageRow['parentId']; limit: number }): Promise<ListMessages> {
    const res = await client.search<{ hits: { total: number; hits: { _source: MessageRow }[] } }>({
        index: indexMessages.index,
        size: 5000,
        sort: ['createdAt:desc', '_score'],
        track_total_hits: true,
        body: {
            query: {
                bool: {
                    must: [{ term: { parentId: opts.parentId } }]
                }
            }
        }
    });

    const hits = res.body.hits;

    return {
        count: typeof hits.total === 'number' ? hits.total : hits.hits.length,
        items: hits.hits.map((hit) => {
            return hit._source;
        })
    };
}
