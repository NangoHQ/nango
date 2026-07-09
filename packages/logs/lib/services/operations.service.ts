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

export const logsOperationsService = {
    async listOperations(params: ListLogOperationsParams): Promise<Result<ListLogOperationsResult>> {
        if (!logsEnvs.NANGO_LOGS_ENABLED) {
            return Err(new LogsDisabledError());
        }

        let rawOps: Awaited<ReturnType<typeof modelOperations.listOperations>>;
        try {
            rawOps = await modelOperations.listOperations({
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
        } catch (err) {
            return Err(err);
        }

        let operations = rawOps.items;
        if (params.search && rawOps.items.length > 0) {
            try {
                const bucket = await modelMessages.searchForMessagesInsideOperations({ search: params.search, operationsIds: rawOps.items.map((op) => op.id) });
                const matched = new Set(bucket.items.map((item) => item.key));
                operations = rawOps.items.filter((item) => matched.has(item.id));
            } catch (err) {
                return Err(err);
            }
        }

        return Ok({
            operations,
            pagination: {
                // With search, we fetch a page of operations first and then keep only the ones with matching messages.
                // rawOps.count still counts every operation before that message filter. The real fix is to move
                // message search into the operation query so the backend can return a filtered count and cursor.
                total: params.search ? operations.length : rawOps.count,
                cursor: rawOps.cursor
            }
        });
    }
};
