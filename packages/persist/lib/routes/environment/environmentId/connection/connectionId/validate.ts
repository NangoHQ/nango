import * as z from 'zod';

import { operationIdRegex } from '@nangohq/logs';

const getCursorQuerySchema = z
    .object({
        model: z.string(),
        offset: z.union([z.literal('first'), z.literal('last')])
    })
    .strict();

const getCursorParamsSchema = z
    .object({
        environmentId: z.coerce.number().int().positive(),
        nangoConnectionId: z.coerce.number().int().positive()
    })
    .strict();

export const getCursorRequestParser = {
    parseQuery: (data: unknown) => getCursorQuerySchema.parse(data),
    parseParams: (data: unknown) => getCursorParamsSchema.parse(data)
};

const getRecordsQuerySchema = z
    .object({
        model: z.string(),
        cursor: z.string().optional(),
        limit: z.coerce.number().int().positive().default(100),
        activityLogId: operationIdRegex.optional(),
        externalIds: z
            .union([
                z.string().min(1).max(256), // There is no diff between a normal query param and an array with one item
                z.array(z.string().min(1).max(256)).max(100)
            ])
            .transform((val) => (Array.isArray(val) ? val : [val]))
            .optional()
    })
    .strict();
const getRecordsParamsSchema = z
    .object({
        environmentId: z.coerce.number().int().positive(),
        nangoConnectionId: z.coerce.number().int().positive()
    })
    .strict();

export const getRecordsRequestParser = {
    parseQuery: (data: unknown) => getRecordsQuerySchema.parse(data),
    parseParams: (data: unknown) => getRecordsParamsSchema.parse(data)
};
