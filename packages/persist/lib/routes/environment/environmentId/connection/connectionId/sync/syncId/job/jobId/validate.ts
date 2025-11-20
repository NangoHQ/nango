import * as z from 'zod';

import { operationIdRegex } from '@nangohq/logs';

const mergingStrategySchema = z.discriminatedUnion('strategy', [
    z.object({
        strategy: z.literal('override')
    }),
    z.object({
        strategy: z.literal('ignore_if_modified_after_cursor'),
        cursor: z.string().optional()
    })
]);

const recordsBodySchema = z
    .object({
        model: z.string(),
        records: z.array(z.object({ id: z.union([z.string().max(255).min(1), z.number()]) }).catchall(z.unknown())).nonempty(),
        providerConfigKey: z.string(),
        connectionId: z.string(),
        activityLogId: operationIdRegex,
        merging: mergingStrategySchema.default({ strategy: 'override' })
    })
    .strict();

const recordsParamsSchema = z
    .object({
        environmentId: z.coerce.number().int().positive(),
        nangoConnectionId: z.coerce.number().int().positive(),
        syncId: z.string(),
        syncJobId: z.coerce.number().int().positive()
    })
    .strict();

export const recordsRequestParser = {
    parseBody: (data: unknown) => recordsBodySchema.parse(data),
    parseParams: (data: unknown) => recordsParamsSchema.parse(data)
};
