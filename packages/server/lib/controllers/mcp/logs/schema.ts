import * as z from 'zod/v4';

import { operationIdRegex } from '@nangohq/logs';

import { defaultLimit, maxLimit } from './utils.js';

import type {
    OperationAction,
    OperationAdmin,
    OperationAuth,
    OperationDeploy,
    OperationOnEvents,
    OperationProxy,
    OperationSync,
    OperationWebhook,
    SearchOperationsState
} from '@nangohq/types';

export const periodSchema = z
    .object({
        from: z.string().datetime(),
        to: z.string().datetime().optional()
    })
    .strict();

export const getOperationArgumentsSchema = z
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

export const getOperationOutputSchema = z
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
            .array(
                z.enum(['incoming', 'forward', 'sync', 'connection_create', 'connection_refresh', 'connection_delete'] satisfies OperationWebhook['action'][])
            )
            .min(1)
            .max(6)
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

export const listOperationsArgumentsSchema = z
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

export const listOperationsOutputSchema = z
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

export type Period = z.infer<typeof periodSchema>;
export type GetOperationArguments = z.infer<typeof getOperationArgumentsSchema>;
export type ListOperationsArguments = z.infer<typeof listOperationsArgumentsSchema>;
