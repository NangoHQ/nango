import { isTest } from '@nangohq/utils';

import { getLogsIngestPipelineId, indexMessages } from '../es/schema.js';
import { client } from '../storage/client.js';
import { createCursor, parseCursor } from './helpers.js';

import type { estypes } from '@elastic/elasticsearch';
import type { LogLevel, MessageRow, OperationRow, SearchOperationsState, SearchPeriod } from '@nangohq/types';

export interface ListMessages {
    count: number;
    items: MessageRow[];
    cursorAfter: string | null;
    cursorBefore: string | null;
}

export const logLevels = { debug: 'debug', info: 'info', warn: 'warn', error: 'error' } as const satisfies { [K in LogLevel]: K };

interface MessagesFilters {
    parentId: string;
    states?: SearchOperationsState[] | undefined;
    search?: string | undefined;
    period?: SearchPeriod | undefined;
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
        pipeline: getLogsIngestPipelineId(indexMessages.index)
    });
    return { index: res._index };
}

function buildMessagesQuery(opts: MessagesFilters): estypes.QueryDslQueryContainer {
    const query: estypes.QueryDslQueryContainer = {
        bool: { must: [{ term: { parentId: opts.parentId } }], should: [] }
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

    if (opts.period) {
        (query.bool!.must as estypes.QueryDslQueryContainer[]).push({
            range: {
                createdAt: { gte: opts.period.from, lte: opts.period.to }
            }
        });
    }

    return query;
}

export async function listMessages(
    opts: MessagesFilters & {
        limit: number;
        levels?: LogLevel[] | undefined;
        cursorBefore?: string | null | undefined;
        cursorAfter?: string | null | undefined;
    }
): Promise<ListMessages> {
    const query = buildMessagesQuery(opts);
    if (opts.levels) {
        (query.bool!.must as estypes.QueryDslQueryContainer[]).push({ terms: { level: opts.levels } });
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
            // Because there is no way to build a cursor if we have no results we resend the same one
            cursorBefore: totalPage > 0 ? createCursor(hits.hits[hits.hits.length - 1]!) : opts.cursorBefore,
            cursorAfter: totalPage > 0 ? createCursor(hits.hits[0]!) : null
        };
    }

    return {
        count: total,
        items,
        cursorBefore: totalPage > 0 ? createCursor(hits.hits[0]!) : null,
        cursorAfter: totalPage > 0 ? createCursor(hits.hits[hits.hits.length - 1]!) : null
    };
}

export async function countMessagesByLevel(opts: MessagesFilters): Promise<Record<LogLevel, number>> {
    const levels = Object.values(logLevels);
    const res = await client.search<MessageRow, { levelAgg: estypes.AggregationsStringTermsAggregate }>({
        index: indexMessages.index,
        size: 0,
        track_total_hits: false,
        query: buildMessagesQuery(opts),
        aggs: {
            levelAgg: { terms: { field: 'level', size: levels.length, include: levels } }
        }
    });

    const counts = { debug: 0, info: 0, warn: 0, error: 0 } satisfies Record<LogLevel, number>;
    const buckets = res.aggregations?.levelAgg.buckets;
    if (Array.isArray(buckets)) {
        for (const bucket of buckets) {
            counts[bucket.key as LogLevel] = bucket.doc_count;
        }
    }
    return counts;
}

/**
 * This method is searching logs inside each operations, returning a list of matching operations.
 */
export async function searchForMessagesInsideOperations(opts: { search: string; operationsIds: string[] }): Promise<{
    items: { key: string; doc_count: number }[];
}> {
    const query: estypes.QueryDslQueryContainer = {
        bool: {
            must: [
                { exists: { field: 'parentId' } },
                {
                    match_phrase_prefix: { meta_search: { query: opts.search } }
                },
                { terms: { parentId: opts.operationsIds } }
            ]
        }
    };

    const res = await client.search<
        OperationRow,
        {
            parentIdAgg: estypes.AggregationsTermsAggregateBase<{ key: string; doc_count: number }>;
        }
    >({
        index: indexMessages.index,
        size: 0,
        sort: [{ createdAt: 'desc' }, 'id'],
        track_total_hits: false,
        query,
        aggs: {
            // We aggregate because we can have N match per operation
            parentIdAgg: { terms: { size: opts.operationsIds.length + 1, field: 'parentId', execution_hint: 'map' } }
        }
    });

    const aggs = res.aggregations!['parentIdAgg']['buckets'];

    return { items: aggs as any };
}
