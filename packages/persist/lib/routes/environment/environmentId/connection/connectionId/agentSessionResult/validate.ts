import * as z from 'zod';

const paramsSchema = z
    .object({
        environmentId: z.coerce.number().int().positive(),
        nangoConnectionId: z.coerce.number().int().positive(),
        sessionId: z.uuid()
    })
    .strict();

const querySchema = z
    .object({
        recordId: z.uuid()
    })
    .strict();

export const getAgentSessionResultRequestParser = {
    parseParams: (data: unknown) => paramsSchema.parse(data),
    parseQuery: (data: unknown) => querySchema.parse(data)
};
