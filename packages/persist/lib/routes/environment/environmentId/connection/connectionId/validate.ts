import { z } from 'zod';
import { validateRequest } from '@nangohq/utils';
import type { Endpoint } from '@nangohq/types';

export const validateCursor = <E extends Endpoint<any>>() =>
    validateRequest<E>({
        parseQuery: (data: unknown) =>
            z
                .object({
                    model: z.string(),
                    offset: z.union([z.literal('first'), z.literal('last')])
                })
                .strict()
                .parse(data),
        parseParams: (data: unknown) =>
            z
                .object({
                    environmentId: z.coerce.number().int().positive(),
                    nangoConnectionId: z.coerce.number().int().positive()
                })
                .strict()
                .parse(data)
    });

export const validateGetRecords = <E extends Endpoint<any>>() =>
    validateRequest<E>({
        parseQuery: (data: unknown) =>
            z
                .object({
                    model: z.string(),
                    cursor: z.string().optional(),
                    externalIds: z
                        .union([
                            z.string().min(1).max(256), // There is no diff between a normal query param and an array with one item
                            z.array(z.string().min(1).max(256)).max(100)
                        ])
                        .transform((val) => (Array.isArray(val) ? val : [val]))
                        .optional()
                })
                .strict()
                .parse(data),
        parseParams: (data: unknown) =>
            z
                .object({
                    environmentId: z.coerce.number().int().positive(),
                    nangoConnectionId: z.coerce.number().int().positive()
                })
                .strict()
                .parse(data)
    });
