import z from 'zod';

const MAX_TELEMETRY_ENTRIES_PER_REQUEST = 1000;

export const telemetryEntrySchema = z.discriminatedUnion('type', [
    z
        .object({
            integrationId: z.string(),
            connectionId: z.string(),
            syncId: z.string().optional(),
            type: z.literal('data_transfer'),
            bytesSent: z.number().int().nonnegative(),
            bytesReceived: z.number().int().nonnegative(),
            callsite: z.enum(['proxy', 'uncontrolled_fetch'])
        })
        .strict()
]);

export const telemetryBodySchema = z
    .object({
        events: z.array(telemetryEntrySchema).min(1).max(MAX_TELEMETRY_ENTRIES_PER_REQUEST)
    })
    .strict();

export const telemetryParamsSchema = z.object({ environmentId: z.coerce.number().int().positive() }).strict();
