import * as z from 'zod/v4';

import { isLogsNotFoundError, LogsDisabledError, logsOperationsService, operationIdRegex } from '@nangohq/logs';

import { defineControlPlaneMcpTool } from '../controlPlaneTool.js';
import { PublicMcpError } from '../utils.js';
import { defaultLimit, logsReadScope, maxLimit, normalizePeriod, periodSchema } from './utils.js';

import type { GetLogOperationParams, GetLogOperationResult } from '@nangohq/logs';

const getOperationArgumentsSchema = z
    .object({
        operationId: operationIdRegex,
        messages: z
            .object({
                limit: z.number().int().min(1).max(maxLimit).optional().default(defaultLimit),
                cursor: z.string().nullable().optional(),
                search: z.string().max(100).optional(),
                period: periodSchema.optional()
            })
            .strict()
            .optional()
    })
    .strict();

const getOperationOutputSchema = z
    .object({
        operation: z.looseObject({}),
        messages: z.array(z.looseObject({})),
        pagination: z
            .object({
                total: z.number(),
                cursor: z.string().nullable()
            })
            .strict()
    })
    .strict();

type ParsedGetOperationArguments = Omit<GetLogOperationParams, 'accountId' | 'environmentId'>;

export const logsGetOperationTool = defineControlPlaneMcpTool<typeof getOperationArgumentsSchema, GetLogOperationResult>({
    name: 'logs_get_operation',
    description: 'Get one Nango log operation and a page of its message rows for the authenticated environment. Messages are returned newest first.',
    inputSchema: getOperationArgumentsSchema,
    outputSchema: getOperationOutputSchema,
    requiredScopes: [logsReadScope],
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

function normalizeGetOperationArguments(args: z.infer<typeof getOperationArgumentsSchema>): ParsedGetOperationArguments {
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
