import { errors } from '@elastic/elasticsearch';

import { isTest } from '@nangohq/utils';

import { createCursor, getFullIndexName, parseCursor } from './helpers.js';
import { client } from '../es/client.js';
import { indexMessages } from '../es/schema.js';

import type { estypes } from '@elastic/elasticsearch';
import type {
    MessageRow,
    OperationRow,
    SearchOperationsConnection,
    SearchOperationsIntegration,
    SearchOperationsPeriod,
    SearchOperationsState,
    SearchOperationsSync,
    SearchOperationsType
} from '@nangohq/types';
import type { SetRequired } from 'type-fest';

export interface ListOperations {
    count: number;
    items: OperationRow[];
    cursor: string | null;
}
export interface ListMessages {
    count: number;
    items: MessageRow[];
    cursorAfter: string | null;
    cursorBefore: string | null;
}
export interface ListFilters {
    items: { key: string; doc_count: number }[];
}

export const ResponseError = errors.ResponseError;

/**
 * Create one operation
 */
export async function createOperation(row: OperationRow): Promise<{ index: string }> {
    const res = await client.create<OperationRow>({
        index: indexMessages.index,
        id: row.id,
        document: row,
        refresh: true,
        pipeline: `daily.${indexMessages.index}`
    });
    return { index: res._index };
}

/**
 * Create one message
 * /!\ They are inserted without an ID to improve indexing time
 * https://www.elastic.co/guide/en/elasticsearch/reference/current/tune-for-indexing-speed.html#_use_auto_generated_ids
 */
export async function createMessage(row: MessageRow): Promise<{ index: string }> {
    const res = await client.index<MessageRow>({
        index: indexMessages.index,
        document: row,
        refresh: isTest,
        pipeline: `daily.${indexMessages.index}`
    });
    return { index: res._index };
}

/**
 * List operations
 */
export async function listOperations(opts: {
    accountId: number;
    environmentId?: number;
    limit: number;
    states?: SearchOperationsState[] | undefined;
    types?: SearchOperationsType[] | undefined;
    integrations?: SearchOperationsIntegration[] | undefined;
    connections?: SearchOperationsConnection[] | undefined;
    syncs?: SearchOperationsSync[] | undefined;
    period?: SearchOperationsPeriod | undefined;
    cursor?: string | null | undefined;
}): Promise<ListOperations> {
    const query: estypes.QueryDslQueryContainer = {
        bool: {
            must: [{ term: { accountId: opts.accountId } }],
            must_not: { exists: { field: 'parentId' } },
            should: []
        }
    };
    if (opts.environmentId) {
        (query.bool!.must as estypes.QueryDslQueryContainer[]).push({ term: { environmentId: opts.environmentId } });
    }
    if (opts.states && (opts.states.length > 1 || opts.states[0] !== 'all')) {
        // Where or
        (query.bool!.must as estypes.QueryDslQueryContainer[]).push({
            bool: {
                should: opts.states.map((state) => {
                    return { term: { state } };
                })
            }
        });
    }
    if (opts.integrations && (opts.integrations.length > 1 || opts.integrations[0] !== 'all')) {
        // Where or
        (query.bool!.must as estypes.QueryDslQueryContainer[]).push({
            bool: {
                should: opts.integrations.map((integration) => {
                    return { term: { 'integrationName.keyword': integration } };
                })
            }
        });
    }
    if (opts.connections && (opts.connections.length > 1 || opts.connections[0] !== 'all')) {
        // Where or
        (query.bool!.must as estypes.QueryDslQueryContainer[]).push({
            bool: {
                should: opts.connections.map((connection) => {
                    return { term: { 'connectionName.keyword': connection } };
                })
            }
        });
    }
    if (opts.syncs && (opts.syncs.length > 1 || opts.syncs[0] !== 'all')) {
        // Where or
        (query.bool!.must as estypes.QueryDslQueryContainer[]).push({
            bool: {
                should: opts.syncs.map((sync) => {
                    return { term: { 'syncConfigName.keyword': sync } };
                })
            }
        });
    }
    if (opts.types && (opts.types.length > 1 || opts.types[0] !== 'all')) {
        const types: estypes.QueryDslQueryContainer[] = [];
        for (const couple of opts.types) {
            const [type, action] = couple.split(':');
            if (action && type) {
                types.push({ bool: { must: [{ term: { 'operation.action': action } }, { term: { 'operation.type': type } }], should: [] } });
            } else if (type) {
                types.push({ term: { 'operation.type': type } });
            }
        }
        // Where or
        (query.bool!.must as estypes.QueryDslQueryContainer[]).push({
            bool: {
                should: types
            }
        });
    }
    if (opts.period) {
        (query.bool!.must as estypes.QueryDslQueryContainer[]).push({
            range: {
                createdAt: { gte: opts.period.from, lte: opts.period.to }
            }
        });
    }

    const cursor = opts.cursor ? parseCursor(opts.cursor) : undefined;
    const res = await client.search<OperationRow>({
        index: indexMessages.index,
        size: opts.limit,
        sort: [{ createdAt: 'desc' }, 'id'],
        track_total_hits: true,
        search_after: cursor,
        query
    });
    const hits = res.hits;

    const total = typeof hits.total === 'object' ? hits.total.value : hits.hits.length;
    const totalPage = hits.hits.length;
    return {
        count: total,
        items: hits.hits.map((hit) => {
            return hit._source!;
        }),
        cursor: totalPage > 0 && total > totalPage && opts.limit <= totalPage ? createCursor(hits.hits[hits.hits.length - 1]!) : null
    };
}

/**
 * Get a single operation
 */
export async function getOperation(opts: { id: OperationRow['id']; indexName?: string | null }): Promise<OperationRow> {
    if (opts.indexName) {
        const res = await client.get<OperationRow>({ index: opts.indexName, id: opts.id });
        return res._source!;
    }

    // Can't perform a getById because we don't know in which index the operation is in
    const res = await client.search<OperationRow>({
        index: indexMessages.index,
        size: 1,
        query: {
            term: { id: opts.id }
        }
    });
    if (res.hits.hits.length <= 0) {
        throw new ResponseError({ statusCode: 404, warnings: [], meta: {} as any });
    }
    return res.hits.hits[0]!._source!;
}

/**
 * Update a row (can be a partial update)
 */
export async function updateOperation({
    id,
    data: { createdAt, ...rest }
}: {
    id: OperationRow['id'];
    data: SetRequired<Partial<Omit<OperationRow, 'id'>>, 'createdAt'>;
}): Promise<void> {
    await client.update({
        index: getFullIndexName(indexMessages.index, createdAt),
        id: id,
        retry_on_conflict: 3,
        refresh: isTest,
        body: {
            doc: {
                ...rest,
                updatedAt: new Date().toISOString()
            }
        }
    });
}

/**
 * Set an operation as currently running
 */
export async function setRunning(opts: Pick<OperationRow, 'id' | 'createdAt'>): Promise<void> {
    await updateOperation({ id: opts.id, data: { createdAt: opts.createdAt, state: 'running', startedAt: new Date().toISOString() } });
}

/**
 * Set an operation as success
 */
export async function setSuccess(opts: Pick<OperationRow, 'id' | 'createdAt'>): Promise<void> {
    await updateOperation({ id: opts.id, data: { createdAt: opts.createdAt, state: 'success', endedAt: new Date().toISOString() } });
}

/**
 * Set an operation as failed
 */
export async function setFailed(opts: Pick<OperationRow, 'id' | 'createdAt'>): Promise<void> {
    await updateOperation({ id: opts.id, data: { createdAt: opts.createdAt, state: 'failed', endedAt: new Date().toISOString() } });
}

/**
 * Set an operation as failed
 */
export async function setCancelled(opts: Pick<OperationRow, 'id' | 'createdAt'>): Promise<void> {
    await updateOperation({ id: opts.id, data: { createdAt: opts.createdAt, state: 'cancelled', endedAt: new Date().toISOString() } });
}

/**
 * Set an operation as timeout
 */
export async function setTimeouted(opts: Pick<OperationRow, 'id' | 'createdAt'>): Promise<void> {
    await updateOperation({ id: opts.id, data: { createdAt: opts.createdAt, state: 'timeout', endedAt: new Date().toISOString() } });
}

/**
 * List messages
 */
export async function listMessages(opts: {
    parentId: string;
    limit: number;
    states?: SearchOperationsState[] | undefined;
    search?: string | undefined;
    cursorBefore?: string | null | undefined;
    cursorAfter?: string | null | undefined;
}): Promise<ListMessages> {
    const query: estypes.QueryDslQueryContainer = {
        bool: {
            must: [{ term: { parentId: opts.parentId } }],
            should: []
        }
    };

    if (opts.states && (opts.states.length > 1 || opts.states[0] !== 'all')) {
        // Where or
        (query.bool!.must as estypes.QueryDslQueryContainer[]).push({
            bool: {
                should: opts.states.map((state) => {
                    return { term: { state } };
                })
            }
        });
    }
    if (opts.search) {
        (query.bool!.must as estypes.QueryDslQueryContainer[]).push({
            match_phrase_prefix: { meta_search: { query: opts.search } }
        });
    }

    // Sort and cursor
    let cursor: any[] | undefined;
    let sort: estypes.Sort = [{ createdAt: 'desc' }, { id: 'desc' }];
    if (opts.cursorBefore) {
        // search_before does not exist so we reverse the sort
        // https://github.com/elastic/elasticsearch/issues/29449
        cursor = parseCursor(opts.cursorBefore);
        sort = [{ createdAt: 'asc' }, { id: 'asc' }];
    } else if (opts.cursorAfter) {
        cursor = opts.cursorAfter ? parseCursor(opts.cursorAfter) : undefined;
    }

    const res = await client.search<MessageRow>({
        index: indexMessages.index,
        size: opts.limit,
        sort,
        track_total_hits: true,
        search_after: cursor,
        query
    });
    const hits = res.hits;

    const total = typeof hits.total === 'object' ? hits.total.value : hits.hits.length;
    const totalPage = hits.hits.length;
    const items = hits.hits.map((hit) => {
        return hit._source!;
    });

    if (opts.cursorBefore) {
        // In case we set before we have to reverse the message since we inverted the sort
        items.reverse();
        return {
            count: total,
            items,
            cursorBefore: totalPage > 0 ? createCursor(hits.hits[hits.hits.length - 1]!) : null,
            cursorAfter: null
        };
    }

    return {
        count: total,
        items,
        cursorBefore: totalPage > 0 ? createCursor(hits.hits[0]!) : null,
        cursorAfter: totalPage > 0 && total > totalPage && totalPage >= opts.limit ? createCursor(hits.hits[hits.hits.length - 1]!) : null
    };
}

/**
 * List filters
 */
export async function listFilters(opts: {
    accountId: number;
    environmentId: number;
    limit: number;
    category: 'integration' | 'syncConfig' | 'connection';
    search?: string | undefined;
}): Promise<ListFilters> {
    let aggField: string;
    if (opts.category === 'integration') {
        aggField = 'integrationName';
    } else if (opts.category === 'connection') {
        aggField = 'connectionName';
    } else {
        aggField = 'syncConfigName';
    }

    const query: estypes.QueryDslQueryContainer = {
        bool: {
            must: [{ term: { accountId: opts.accountId } }, { term: { environmentId: opts.environmentId } }],
            must_not: { exists: { field: 'parentId' } },
            should: []
        }
    };

    if (opts.search) {
        (query.bool!.must as estypes.QueryDslQueryContainer[]).push({ match_phrase_prefix: { [aggField]: { query: opts.search } } });
    }

    const res = await client.search<
        never,
        {
            byName: estypes.AggregationsTermsAggregateBase<{ key: string; doc_count: number }>;
        }
    >({
        index: indexMessages.index,
        size: 0,
        track_total_hits: true,
        aggs: { byName: { terms: { field: `${aggField}.keyword`, size: opts.limit } } },
        query
    });
    const agg = res.aggregations!['byName'];

    return {
        items: agg.buckets as any
    };
}

export async function setCancelledForAuth(opts: { wait?: boolean } = {}): Promise<void> {
    await client.updateByQuery({
        index: indexMessages.index,
        wait_for_completion: opts.wait === true,
        refresh: opts.wait === true,
        query: {
            bool: {
                filter: [
                    { range: { expiresAt: { lt: 'now' } } },
                    { term: { 'operation.type': 'auth' } },
                    { term: { 'operation.action': 'create_connection' } },
                    {
                        bool: {
                            should: [{ term: { state: 'waiting' } }, { term: { state: 'running' } }]
                        }
                    }
                ],
                must_not: { exists: { field: 'parentId' } },
                should: []
            }
        },
        script: {
            source: "ctx._source.state = 'cancelled'"
        }
    });
}

export async function setTimeoutForAll(opts: { wait?: boolean } = {}): Promise<void> {
    await client.updateByQuery({
        index: indexMessages.index,
        wait_for_completion: opts.wait === true,
        refresh: opts.wait === true,
        query: {
            bool: {
                filter: [
                    { range: { expiresAt: { lt: 'now' } } },
                    {
                        bool: {
                            should: [{ term: { state: 'waiting' } }, { term: { state: 'running' } }]
                        }
                    }
                ],
                must_not: { exists: { field: 'parentId' } },
                should: []
            }
        },
        script: {
            source: "ctx._source.state = 'timeout'"
        }
    });
}
