import { Err, Ok } from '@nangohq/utils';

import { envs as logsEnvs } from '../env.js';
import * as modelMessages from '../models/messages.js';
import * as modelOperations from '../models/operations.js';
import { LogsDisabledError, LogsNotFoundError } from '../utils.js';

import type { MessageRow, OperationRow, SearchOperationsState, SearchOperationsType, SearchPeriod } from '@nangohq/types';
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

export interface GetLogOperationParams {
    accountId: number;
    environmentId: number;
    operationId: string;
    messages: {
        limit: number;
        cursor?: string | null | undefined;
        search?: string | undefined;
        period?: SearchPeriod | undefined;
    };
}

export interface GetLogOperationResult {
    operation: OperationRow;
    messages: MessageRow[];
    pagination: {
        total: number;
        cursor: string | null;
    };
}

export const logsOperationsService = {
    async listOperations(params: ListLogOperationsParams): Promise<Result<ListLogOperationsResult>> {
        if (!logsEnvs.NANGO_LOGS_ENABLED) {
            return Err(new LogsDisabledError());
        }

        try {
            const rawOps = await listOperationPage(params);
            let operations = rawOps.items;

            if (params.search && rawOps.items.length > 0) {
                const bucket = await modelMessages.searchForMessagesInsideOperations({ search: params.search, operationsIds: rawOps.items.map((op) => op.id) });
                const matched = new Set(bucket.items.map((item) => item.key));
                operations = rawOps.items.filter((item) => matched.has(item.id));
            }

            return Ok({
                operations,
                pagination: {
                    // Message search is applied to one fetched operations page because it queries the messages index.
                    // The limit bounds operations inspected, so this page can return fewer matches while still having a cursor.
                    total: params.search ? operations.length : rawOps.count,
                    cursor: rawOps.cursor
                }
            });
        } catch (err) {
            return Err(err);
        }
    },

    async getOperation(params: GetLogOperationParams): Promise<Result<GetLogOperationResult>> {
        if (!logsEnvs.NANGO_LOGS_ENABLED) {
            return Err(new LogsDisabledError());
        }

        try {
            const operation = await modelOperations.getOperation({ id: params.operationId });
            if (operation.accountId !== params.accountId || operation.environmentId !== params.environmentId) {
                return Err(new LogsNotFoundError());
            }

            const rawMessages = await modelMessages.listMessages({
                parentId: params.operationId,
                limit: params.messages.limit,
                search: params.messages.search,
                cursorAfter: params.messages.cursor,
                period: params.messages.period
            });

            return Ok({
                operation,
                messages: rawMessages.items,
                pagination: {
                    total: rawMessages.count,
                    cursor: rawMessages.cursorAfter
                }
            });
        } catch (err) {
            return Err(err);
        }
    }
};

type ListOperationPage = Awaited<ReturnType<typeof modelOperations.listOperations>>;

async function listOperationPage(params: ListLogOperationsParams): Promise<ListOperationPage> {
    return modelOperations.listOperations({
        accountId: params.accountId,
        environmentId: params.environmentId,
        limit: params.limit,
        states: params.states,
        types: params.types,
        integrations: params.integrations,
        connections: params.connections,
        syncs: params.syncs,
        period: params.period,
        cursor: params.cursor
    });
}
