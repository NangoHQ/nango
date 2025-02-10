import { z } from 'zod';

const mergingStrategySchema = z.discriminatedUnion('strategy', [
    z.object({
        strategy: z.literal('override')
    }),
    z.object({
        strategy: z.literal('ignore_if_modified_after_cursor'),
        cursor: z.string().optional()
    })
]);

export const recordsRequestParser = {
    parseBody: (data: unknown) =>
        z
            .object({
                model: z.string(),
                records: z.array(z.object({ id: z.union([z.string().max(255).min(1), z.number()]) }).catchall(z.unknown())).nonempty(),
                providerConfigKey: z.string(),
                connectionId: z.string(),
                activityLogId: z.string(),
                merging: mergingStrategySchema.default({ strategy: 'override' })
            })
            .strict()
            .parse(data),
    parseParams: (data: unknown) =>
        z
            .object({
                environmentId: z.coerce.number().int().positive(),
                nangoConnectionId: z.coerce.number().int().positive(),
                syncId: z.string(),
                syncJobId: z.coerce.number().int().positive()
            })
            .strict()
            .parse(data)
};
