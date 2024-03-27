import { client } from '../es/client.js';
import type { MessageRow } from '../types/messages.js';
import { indexMessages } from '../es/schema.js';

export interface ListOperations {
    count: number;
    items: MessageRow[];
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
        document: row,
        refresh: true
    });
}

/**
 * List operations
 */
export async function listOperations(opts: { limit: number }): Promise<ListOperations> {
    const res = await client.search<MessageRow>({
        index: indexMessages.index,
        size: opts.limit,
        sort: [{ createdAt: 'desc' }, '_score'],
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
        items: res.hits.hits.map((hit) => {
            return hit._source!;
        })
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
    const res = await client.search<MessageRow>({
        index: indexMessages.index,
        size: 5000,
        sort: [{ createdAt: 'desc' }, '_score'],
        track_total_hits: true,
        query: {
            // @ts-expect-error I don't get the error
            bool: {
                must: [{ term: { parentId: opts.parentId } }]
            }
        }
    });

    return {
        count: typeof res.hits.total === 'number' ? res.hits.total : res.hits.hits.length,
        items: res.hits.hits.map((hit) => {
            return hit._source!;
        })
    };
}
