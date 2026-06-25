import * as z from 'zod/v4';

import { modelMessages, modelOperations } from '@nangohq/logs';
import { Err, Ok } from '@nangohq/utils';

import { PublicMcpError } from '../utils.js';
import { checkLogsEnabled, defaultLimit, logsReadScope, maxLimit, normalizePeriod, periodSchema } from './utils.js';

import type { ControlPlaneMcpTool } from '../controlPlaneTool.js';
import type { AnySchema } from '@modelcontextprotocol/sdk/server/zod-compat.js';
import type { DBEnvironment, DBTeam, OperationRow, SearchOperationsState, SearchOperationsType, SearchPeriod } from '@nangohq/types';
import type { Result } from '@nangohq/utils';

const defaultOperationsPeriodMs = 24 * 60 * 60 * 1000;

const statesSchema = z
    .array(z.enum(['waiting', 'running', 'success', 'failed', 'timeout', 'cancelled'] satisfies SearchOperationsState[]))
    .max(10)
    .optional();

const actionOperationFilterSchema = z
    .object({
        type: z.literal('action'),
        actions: z
            .array(z.enum(['run']))
            .min(1)
            .max(1)
            .optional()
    })
    .strict();

const syncOperationFilterSchema = z
    .object({
        type: z.literal('sync'),
        actions: z
            .array(z.enum(['pause', 'unpause', 'run', 'request_run', 'request_run_full', 'cancel', 'init', 'create_variant', 'delete_variant']))
            .min(1)
            .max(9)
            .optional()
    })
    .strict();

const proxyOperationFilterSchema = z
    .object({
        type: z.literal('proxy'),
        actions: z
            .array(z.enum(['call']))
            .min(1)
            .max(1)
            .optional()
    })
    .strict();

const eventsOperationFilterSchema = z
    .object({
        type: z.literal('events'),
        actions: z
            .array(z.enum(['post_connection_creation', 'pre_connection_deletion', 'validate_connection']))
            .min(1)
            .max(3)
            .optional()
    })
    .strict();

const authOperationFilterSchema = z
    .object({
        type: z.literal('auth'),
        actions: z
            .array(z.enum(['create_connection', 'refresh_token', 'post_connection', 'connection_test']))
            .min(1)
            .max(4)
            .optional()
    })
    .strict();

const adminOperationFilterSchema = z
    .object({
        type: z.literal('admin'),
        actions: z
            .array(z.enum(['impersonation']))
            .min(1)
            .max(1)
            .optional()
    })
    .strict();

const webhookOperationFilterSchema = z
    .object({
        type: z.literal('webhook'),
        actions: z
            .array(z.enum(['incoming', 'forward', 'sync', 'connection_create', 'connection_refresh']))
            .min(1)
            .max(5)
            .optional()
    })
    .strict();

const deployOperationFilterSchema = z
    .object({
        type: z.literal('deploy'),
        actions: z
            .array(z.enum(['prebuilt', 'custom']))
            .min(1)
            .max(2)
            .optional()
    })
    .strict();

const operationFilterSchema = z.discriminatedUnion('type', [
    actionOperationFilterSchema,
    syncOperationFilterSchema,
    proxyOperationFilterSchema,
    eventsOperationFilterSchema,
    authOperationFilterSchema,
    adminOperationFilterSchema,
    webhookOperationFilterSchema,
    deployOperationFilterSchema
]);

const listOperationsArgumentsSchema = z
    .object({
        search: z.string().max(256).optional(),
        limit: z.number().int().min(1).max(maxLimit).optional().default(defaultLimit),
        cursor: z.string().nullable().optional(),
        states: statesSchema,
        operations: z.array(operationFilterSchema).max(20).optional(),
        integrations: z.array(z.string().min(1).max(256)).max(20).optional(),
        connections: z.array(z.string().min(1).max(256)).max(20).optional(),
        syncs: z.array(z.string().min(1).max(256)).max(20).optional(),
        period: periodSchema.optional()
    })
    .strict();

const listOperationsOutputSchema = z
    .object({
        operations: z.array(z.object({}).passthrough()),
        pagination: z
            .object({
                total: z.number(),
                cursor: z.string().nullable()
            })
            .strict()
    })
    .strict();

type ListOperationsArguments = z.infer<typeof listOperationsArgumentsSchema>;

interface ListOperationsResponse {
    operations: OperationRow[];
    pagination: {
        total: number;
        cursor: string | null;
    };
}

export const logsListOperationsTool: ControlPlaneMcpTool<ListOperationsResponse> = {
    name: 'logs_list_operations',
    description: [
        'List Nango log operations.',
        'Log operations are top-level execution records for syncs, actions, auth, webhooks, proxy calls, and other Nango activity; each operation contains its related log messages.',
        'Results are newest first and can be filtered by status, operation, integration, connection, script, date range, and message search.'
    ].join(' '),
    inputSchema: listOperationsArgumentsSchema as unknown as AnySchema,
    outputSchema: listOperationsOutputSchema as unknown as AnySchema,
    requiredScopes: [logsReadScope],
    async handler(args, { account, environment }) {
        const logsEnabled = checkLogsEnabled();
        if (logsEnabled.isErr()) {
            return Err(logsEnabled.error);
        }

        return await listOperations({ account, environment, args });
    }
};

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

async function listOperations({
    account,
    environment,
    args
}: {
    account: DBTeam;
    environment: DBEnvironment;
    args: unknown;
}): Promise<Result<ListOperationsResponse>> {
    const parsedArgs = listOperationsArgumentsSchema.safeParse(args ?? {});
    if (!parsedArgs.success) {
        return Err(new PublicMcpError(formatListOperationsArgumentsError(parsedArgs.error)));
    }

    const parsed = parsedArgs.data;
    const period = parsed.period ? normalizePeriod(parsed.period) : defaultOperationsPeriod();
    let rawOps: Awaited<ReturnType<typeof modelOperations.listOperations>>;
    try {
        rawOps = await modelOperations.listOperations({
            accountId: account.id,
            environmentId: environment.id,
            limit: parsed.limit,
            states: normalizeFilterArray(parsed.states),
            types: normalizeOperations(parsed.operations),
            integrations: normalizeFilterArray(parsed.integrations),
            connections: normalizeFilterArray(parsed.connections),
            syncs: normalizeFilterArray(parsed.syncs),
            period,
            cursor: parsed.cursor
        });
    } catch (err) {
        return Err(err);
    }

    let operations = rawOps.items;
    if (parsed.search && rawOps.items.length > 0) {
        try {
            const bucket = await modelMessages.searchForMessagesInsideOperations({ search: parsed.search, operationsIds: rawOps.items.map((op) => op.id) });
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
            total: parsed.search ? operations.length : rawOps.count,
            cursor: rawOps.cursor
        }
    });
}

function formatListOperationsArgumentsError(error: z.ZodError): string {
    const details = error.issues
        .map((issue) => {
            const path = issue.path.length > 0 ? issue.path.map(String).join('.') : 'arguments';
            return `${path}: ${issue.message}`;
        })
        .join('; ');

    return details ? `Invalid logs_list_operations arguments: ${details}` : 'Invalid logs_list_operations arguments';
}
