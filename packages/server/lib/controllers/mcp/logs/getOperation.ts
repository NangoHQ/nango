import * as z from 'zod/v4';

import { isLogsNotFoundError, LogsDisabledError, logsOperationsService, operationIdRegex } from '@nangohq/logs';
import { Err, Ok } from '@nangohq/utils';

import { defineControlPlaneMcpTool } from '../controlPlaneTool.js';
import { PublicMcpError } from '../utils.js';
import { defaultLimit, logsReadScope, maxLimit, normalizePeriod, periodSchema } from './utils.js';

import type { GetLogOperationParams, GetLogOperationResult } from '@nangohq/logs';
import type { Result } from '@nangohq/utils';

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

export const logsGetOperationTool = defineControlPlaneMcpTool<GetLogOperationResult>({
    name: 'logs_get_operation',
    description: 'Get one Nango log operation and a page of its message rows for the authenticated environment. Messages are returned newest first.',
    inputSchema: getOperationArgumentsSchema,
    outputSchema: getOperationOutputSchema,
    requiredScopes: [logsReadScope],
    async handler(args, { account, environment }) {
        const parsedArgs = parseGetOperationArguments(args);
        if (parsedArgs.isErr()) {
            return Err(parsedArgs.error);
        }

        const result = await logsOperationsService.getOperation({
            accountId: account.id,
            environmentId: environment.id,
            ...parsedArgs.value
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

function parseGetOperationArguments(args: unknown): Result<ParsedGetOperationArguments> {
    const parsedArgs = getOperationArgumentsSchema.safeParse(args ?? {});
    if (!parsedArgs.success) {
        return Err(new PublicMcpError(formatGetOperationArgumentsError(parsedArgs.error)));
    }

    const parsed = parsedArgs.data;
    return Ok({
        operationId: parsed.operationId,
        messages: {
            limit: parsed.messages?.limit ?? defaultLimit,
            cursor: parsed.messages?.cursor,
            search: parsed.messages?.search,
            period: parsed.messages?.period ? normalizePeriod(parsed.messages.period) : undefined
        }
    });
}

function formatGetOperationArgumentsError(error: z.ZodError): string {
    const details = error.issues
        .map((issue) => {
            const path = issue.path.length > 0 ? issue.path.map(String).join('.') : 'arguments';
            return `${path}: ${issue.message}`;
        })
        .join('; ');

    return details ? `Invalid logs_get_operation arguments: ${details}` : 'Invalid logs_get_operation arguments';
}
