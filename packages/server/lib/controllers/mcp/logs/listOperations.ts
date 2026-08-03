import * as z from 'zod/v4';

import { LogsDisabledError, logsOperationsService } from '@nangohq/logs';

import { defineControlPlaneMcpTool } from '../controlPlaneTool.js';
import { PublicMcpError } from '../utils.js';
import { defaultLimit, logsReadScope, maxLimit, normalizePeriod, periodSchema } from './utils.js';

import type { ListLogOperationsParams, ListLogOperationsResult } from '@nangohq/logs';
import type {
    OperationAction,
    OperationAdmin,
    OperationAuth,
    OperationDeploy,
    OperationOnEvents,
    OperationProxy,
    OperationSync,
    OperationWebhook,
    SearchOperationsState,
    SearchOperationsType,
    SearchPeriod
} from '@nangohq/types';

const defaultOperationsPeriodMs = 24 * 60 * 60 * 1000;

const statesSchema = z
    .array(z.enum(['waiting', 'running', 'success', 'failed', 'timeout', 'cancelled'] satisfies SearchOperationsState[]))
    .max(10)
    .optional();

const actionOperationFilterSchema = z
    .object({
        type: z.literal('action'),
        actions: z
            .array(z.enum(['run'] satisfies OperationAction['action'][]))
            .min(1)
            .max(1)
            .optional()
    })
    .strict();

const syncOperationFilterSchema = z
    .object({
        type: z.literal('sync'),
        actions: z
            .array(
                z.enum([
                    'pause',
                    'unpause',
                    'run',
                    'request_run',
                    'request_run_full',
                    'cancel',
                    'init',
                    'create_variant',
                    'delete_variant'
                ] satisfies OperationSync['action'][])
            )
            .min(1)
            .max(9)
            .optional()
    })
    .strict();

const proxyOperationFilterSchema = z
    .object({
        type: z.literal('proxy'),
        actions: z
            .array(z.enum(['call'] satisfies OperationProxy['action'][]))
            .min(1)
            .max(1)
            .optional()
    })
    .strict();

const eventsOperationFilterSchema = z
    .object({
        type: z.literal('events'),
        actions: z
            .array(z.enum(['post_connection_creation', 'pre_connection_deletion', 'validate_connection'] satisfies OperationOnEvents['action'][]))
            .min(1)
            .max(3)
            .optional()
    })
    .strict();

const authOperationFilterSchema = z
    .object({
        type: z.literal('auth'),
        actions: z
            .array(z.enum(['create_connection', 'refresh_token', 'post_connection', 'connection_test'] satisfies OperationAuth['action'][]))
            .min(1)
            .max(4)
            .optional()
    })
    .strict();

const adminOperationFilterSchema = z
    .object({
        type: z.literal('admin'),
        actions: z
            .array(z.enum(['impersonation'] satisfies OperationAdmin['action'][]))
            .min(1)
            .max(1)
            .optional()
    })
    .strict();

const webhookOperationFilterSchema = z
    .object({
        type: z.literal('webhook'),
        actions: z
            .array(z.enum(['incoming', 'forward', 'sync', 'connection_create', 'connection_refresh'] satisfies OperationWebhook['action'][]))
            .min(1)
            .max(5)
            .optional()
    })
    .strict();

const deployOperationFilterSchema = z
    .object({
        type: z.literal('deploy'),
        actions: z
            .array(z.enum(['prebuilt', 'custom'] satisfies OperationDeploy['action'][]))
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
        operations: z.array(z.looseObject({})),
        pagination: z
            .object({
                total: z.number(),
                cursor: z.string().nullable()
            })
            .strict()
    })
    .strict();

type ListOperationsArguments = z.infer<typeof listOperationsArgumentsSchema>;
type ParsedListOperationsArguments = Omit<ListLogOperationsParams, 'accountId' | 'environmentId'>;

export const logsListOperationsTool = defineControlPlaneMcpTool<typeof listOperationsArgumentsSchema, ListLogOperationsResult>({
    name: 'logs_list_operations',
    description: [
        'List Nango log operations.',
        'Log operations are top-level execution records for syncs, actions, auth, webhooks, proxy calls, and other Nango activity; each operation contains its related log messages.',
        'Results are newest first and can be filtered by status, operation, integration, connection, script, date range, and message search.',
        'When message search is used, limit is the maximum number of operations inspected for one call, so the response can contain fewer or zero matching operations while still returning a pagination cursor for the next page.'
    ].join(' '),
    inputSchema: listOperationsArgumentsSchema,
    outputSchema: listOperationsOutputSchema,
    requiredScopes: { every: [logsReadScope] },
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
