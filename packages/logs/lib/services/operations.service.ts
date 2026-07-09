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

export const logsDisabledErrorMessage = 'Nango logs are disabled';

interface ListLogOperationsSearchParams extends ListLogOperationsParams {
    search: string;
}

export const logsOperationsService = {
    async listOperations(params: ListLogOperationsParams): Promise<Result<ListLogOperationsResult>> {
        if (!logsEnvs.NANGO_LOGS_ENABLED) {
            return Err(new Error(logsDisabledErrorMessage));
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
    const rawOps = await listOperationPage(params, { limit: params.limit, cursor: params.cursor });
    let operations = rawOps.items;

    if (rawOps.items.length > 0) {
        const bucket = await modelMessages.searchForMessagesInsideOperations({ search: params.search, operationsIds: rawOps.items.map((op) => op.id) });
        const matched = new Set(bucket.items.map((item) => item.key));
        operations = rawOps.items.filter((item) => matched.has(item.id));
    }

    return {
        operations,
        pagination: {
            // Message search is applied to one fetched operations page because it queries the messages index.
            // The limit bounds operations inspected, so this page can return fewer matches while still having a cursor.
            total: operations.length,
            cursor: rawOps.cursor
        }
    };
}
