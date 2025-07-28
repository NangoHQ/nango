import { isTest } from '@nangohq/utils';

import { createCursor, parseCursor } from './helpers.js';
import { client } from '../es/client.js';
import { indexMessages } from '../es/schema.js';

import type { estypes } from '@elastic/elasticsearch';
import type { MessageRow, OperationRow, SearchOperationsState, SearchPeriod } from '@nangohq/types';

export interface ListMessages {
    count: number;
    items: MessageRow[];
    cursorAfter: string | null;
    cursorBefore: string | null;
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
 * List messages
 */
export async function listMessages(opts: {
    parentId: string;
    limit: number;
    states?: SearchOperationsState[] | undefined;
    search?: string | undefined;
    cursorBefore?: string | null | undefined;
    cursorAfter?: string | null | undefined;
    period?: SearchPeriod | undefined;
}): Promise<ListMessages> {
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
            parentIdAgg: { terms: { size: opts.operationsIds.length + 1, field: 'parentId' } }
        }
    });

    const aggs = res.aggregations!['parentIdAgg']['buckets'];

    return { items: aggs as any };
}
