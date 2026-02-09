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
                z.string().min(1).max(256),
                z.array(z.string().min(1).max(256)).max(100),
                z.record(z.string(), z.string()) // qs: index > 20 => object
            ])
            .transform((val): string[] | undefined => {
                if (typeof val === 'string') return [val];
                if (Array.isArray(val)) return val;
                const keys = Object.keys(val)
                    .filter((k) => /^\d+$/.test(k))
                    .sort((a, b) => Number(a) - Number(b));
                return keys.length > 0 ? keys.map((k) => val[k]).filter((v): v is string => typeof v === 'string') : undefined;
            })
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
