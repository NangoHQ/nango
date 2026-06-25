import * as z from 'zod/v4';

import { isLogsNotFoundError, modelMessages, modelOperations, operationIdRegex } from '@nangohq/logs';

import { assertLogsEnabled, defaultLimit, jsonContent, logsReadScope, maxLimit, normalizePeriod, periodSchema } from './shared.js';

import type { ControlPlaneMcpTool } from '../controlPlaneTool.js';
import type { AnySchema } from '@modelcontextprotocol/sdk/server/zod-compat.js';
import type { DBEnvironment, DBTeam } from '@nangohq/types';

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

export const logsGetOperationTool: ControlPlaneMcpTool = {
    name: 'logs_get_operation',
    description: 'Get one Nango log operation and a page of its message rows for the authenticated environment. Messages are returned newest first.',
    inputSchema: getOperationArgumentsSchema as unknown as AnySchema,
    requiredScopes: [logsReadScope],
    async handler(args, { account, environment }) {
        assertLogsEnabled();
        return jsonContent(await getOperation({ account, environment, args }));
    }
};

async function getOperation({ account, environment, args }: { account: DBTeam; environment: DBEnvironment; args: unknown }) {
    const parsed = getOperationArgumentsSchema.parse(args ?? {});

    try {
        const operation = await modelOperations.getOperation({ id: parsed.operationId });
        if (operation.accountId !== account.id || operation.environmentId !== environment.id || !operation.operation) {
            throwNotFound();
        }

        const period = parsed.messages?.period ? normalizePeriod(parsed.messages.period) : undefined;
        const rawMessages = await modelMessages.listMessages({
            parentId: parsed.operationId,
            limit: parsed.messages?.limit ?? defaultLimit,
            search: parsed.messages?.search,
            cursorAfter: parsed.messages?.cursor,
            period
        });

        return {
            operation,
            messages: rawMessages.items,
            pagination: {
                total: rawMessages.count,
                cursor: rawMessages.cursorAfter
            }
        };
    } catch (err) {
        if (isLogsNotFoundError(err)) {
            throwNotFound();
        }
        throw err;
    }
}

function throwNotFound(): never {
    throw new Error('Operation not found');
}
