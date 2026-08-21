import { LogsDisabledError, logsOperationsService } from '@nangohq/logs';

import { defineManagementMcpTool } from '../managementTool.js';
import { PublicMcpError } from '../utils.js';
import { listOperationsArgumentsSchema, listOperationsOutputSchema } from './schema.js';
import { logsReadScope, normalizePeriod } from './utils.js';

import type { ListOperationsArguments } from './schema.js';
import type { ListLogOperationsParams, ListLogOperationsResult } from '@nangohq/logs';
import type { SearchOperationsType, SearchPeriod } from '@nangohq/types';

const defaultOperationsPeriodMs = 24 * 60 * 60 * 1000;
type ParsedListOperationsArguments = Omit<ListLogOperationsParams, 'accountId' | 'environmentId'>;

export const listLogOperationsTool = defineManagementMcpTool<typeof listOperationsArgumentsSchema, ListLogOperationsResult>({
    name: 'logs_list_operations',
    description: [
        'List Nango log operations.',
        'Log operations are top-level execution records for syncs, actions, auth, webhooks, proxy calls, and other Nango activity; each operation contains its related log messages.',
        'Results are newest first and can be filtered by status, operation, integration, connection, script, date range, and message search.',
        'When message search is used, limit is the maximum number of operations inspected for one call, so the response can contain fewer or zero matching operations while still returning a pagination cursor for the next page.'
    ].join(' '),
    inputSchema: listOperationsArgumentsSchema,
    outputSchema: listOperationsOutputSchema,
    annotations: { readOnlyHint: true },
    requiredScopes: { every: [logsReadScope] },
    audit: { kind: 'no-audit', reason: 'read-only' },
    async handler({ args, account, environment }) {
        const result = await logsOperationsService.listOperations({
            accountId: account.id,
            environmentId: environment.id,
            ...normalizeListOperationsArguments(args)
        });

        return result.mapError((error) => {
            if (error instanceof LogsDisabledError) {
                return new PublicMcpError(error.message);
            }

            return error;
        });
    }
});

function defaultOperationsPeriod(): SearchPeriod {
    const to = new Date();
    const from = new Date(to.getTime() - defaultOperationsPeriodMs);
    return { from: from.toISOString(), to: to.toISOString() };
}

function normalizeOperations(filters: ListOperationsArguments['operations']): SearchOperationsType[] | undefined {
    if (!filters || filters.length <= 0) {
        return undefined;
    }

    const normalized = new Set<SearchOperationsType>();
    for (const filter of filters) {
        if (!filter.actions) {
            normalized.add(filter.type);
            continue;
        }

        for (const action of filter.actions) {
            normalized.add(`${filter.type}:${action}` as SearchOperationsType);
        }
    }

    return Array.from(normalized);
}

function normalizeFilterArray<T>(values: T[] | undefined): T[] | undefined {
    return values && values.length > 0 ? values : undefined;
}

function normalizeListOperationsArguments(args: ListOperationsArguments): ParsedListOperationsArguments {
    const period = args.period ? normalizePeriod(args.period) : defaultOperationsPeriod();

    return {
        limit: args.limit,
        cursor: args.cursor,
        states: normalizeFilterArray(args.states),
        types: normalizeOperations(args.operations),
        integrations: normalizeFilterArray(args.integrations),
        connections: normalizeFilterArray(args.connections),
        syncs: normalizeFilterArray(args.syncs),
        period,
        search: args.search
    };
}
