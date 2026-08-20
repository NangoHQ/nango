import { isLogsNotFoundError, LogsDisabledError, logsOperationsService } from '@nangohq/logs';

import { defineManagementMcpTool } from '../managementTool.js';
import { PublicMcpError } from '../utils.js';
import { getOperationArgumentsSchema, getOperationOutputSchema } from './schema.js';
import { defaultLimit, logsReadScope, normalizePeriod } from './utils.js';

import type { GetOperationArguments } from './schema.js';
import type { GetLogOperationParams, GetLogOperationResult } from '@nangohq/logs';

type ParsedGetOperationArguments = Omit<GetLogOperationParams, 'accountId' | 'environmentId'>;

export const getLogOperationTool = defineManagementMcpTool<typeof getOperationArgumentsSchema, GetLogOperationResult>({
    name: 'logs_get_operation',
    description: 'Get one Nango log operation and a page of its message rows for the authenticated environment. Messages are returned newest first.',
    inputSchema: getOperationArgumentsSchema,
    outputSchema: getOperationOutputSchema,
    annotations: { readOnlyHint: true },
    requiredScopes: { every: [logsReadScope] },
    audit: { kind: 'no-audit', reason: 'read-only' },
    async handler({ args, account, environment }) {
        const result = await logsOperationsService.getOperation({
            accountId: account.id,
            environmentId: environment.id,
            ...normalizeGetOperationArguments(args)
        });

        return result.mapError((error) => {
            if (error instanceof LogsDisabledError) {
                return new PublicMcpError(error.message);
            }

            if (isLogsNotFoundError(error)) {
                return new PublicMcpError('Operation not found');
            }

            return error;
        });
    }
});

function normalizeGetOperationArguments(args: GetOperationArguments): ParsedGetOperationArguments {
    return {
        operationId: args.operationId,
        messages: {
            limit: args.messages?.limit ?? defaultLimit,
            cursor: args.messages?.cursor,
            search: args.messages?.search,
            period: args.messages?.period ? normalizePeriod(args.messages.period) : undefined
        }
    };
}
