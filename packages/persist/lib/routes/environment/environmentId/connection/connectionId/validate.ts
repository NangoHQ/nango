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
