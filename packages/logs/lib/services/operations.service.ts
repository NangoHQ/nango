import { Err, Ok } from '@nangohq/utils';

import { envs as logsEnvs } from '../env.js';
import * as modelMessages from '../models/messages.js';
import * as modelOperations from '../models/operations.js';

import type { OperationRow, SearchOperationsState, SearchOperationsType, SearchPeriod } from '@nangohq/types';
import type { Result } from '@nangohq/utils';

export interface ListLogOperationsParams {
    accountId: number;
    environmentId: number;
    limit: number;
    cursor?: string | null | undefined;
    states?: SearchOperationsState[] | undefined;
    types?: SearchOperationsType[] | undefined;
    integrations?: string[] | undefined;
    connections?: string[] | undefined;
    syncs?: string[] | undefined;
    period: SearchPeriod;
    search?: string | undefined;
}

export interface ListLogOperationsResult {
    operations: OperationRow[];
    pagination: {
        total: number;
        cursor: string | null;
    };
}

export class LogsDisabledError extends Error {
    constructor() {
        super('Nango logs are disabled');
        this.name = 'LogsDisabledError';
    }
}

interface ListLogOperationsSearchParams extends ListLogOperationsParams {
    search: string;
}

export const logsOperationsService = {
    async listOperations(params: ListLogOperationsParams): Promise<Result<ListLogOperationsResult>> {
        if (!logsEnvs.NANGO_LOGS_ENABLED) {
            return Err(new LogsDisabledError());
        }

        try {
            if (params.search) {
                return Ok(await listOperationsWithMessageSearch({ ...params, search: params.search }));
            }

            const rawOps = await listOperationPage(params, { limit: params.limit, cursor: params.cursor });
            return Ok({
                operations: rawOps.items,
                pagination: {
                    total: rawOps.count,
                    cursor: rawOps.cursor
                }
            });
        } catch (err) {
            return Err(err);
        }
    }
};

type ListOperationPage = Awaited<ReturnType<typeof modelOperations.listOperations>>;

async function listOperationPage(params: ListLogOperationsParams, page: { limit: number; cursor?: string | null | undefined }): Promise<ListOperationPage> {
    return await modelOperations.listOperations({
        accountId: params.accountId,
        environmentId: params.environmentId,
        limit: page.limit,
        states: params.states,
        types: params.types,
        integrations: params.integrations,
        connections: params.connections,
        syncs: params.syncs,
        period: params.period,
        cursor: page.cursor
    });
}

async function listOperationsWithMessageSearch(params: ListLogOperationsSearchParams): Promise<ListLogOperationsResult> {
    const operations: OperationRow[] = [];
    let cursor = params.cursor;
    let nextCursor: string | null = null;

    while (operations.length < params.limit) {
        const rawOps = await listOperationPage(params, { limit: params.limit - operations.length, cursor });
        nextCursor = rawOps.cursor;

        if (rawOps.items.length > 0) {
            const bucket = await modelMessages.searchForMessagesInsideOperations({ search: params.search, operationsIds: rawOps.items.map((op) => op.id) });
            const matched = new Set(bucket.items.map((item) => item.key));
            operations.push(...rawOps.items.filter((item) => matched.has(item.id)));
        }

        if (!rawOps.cursor || rawOps.items.length <= 0) {
            break;
        }
        cursor = rawOps.cursor;
    }

    return {
        operations,
        pagination: {
            // Message search is applied after fetching operation pages because it queries the messages index.
            // We only know how many matching operations were collected for this response without a cross-index query.
            total: operations.length,
            cursor: nextCursor
        }
    };
}
