import * as z from 'zod';

const paramsSchema = z
    .object({
        environmentId: z.coerce.number().int().positive(),
        nangoConnectionId: z.coerce.number().int().positive()
    })
    .strict();

const querySchema = z
    .object({
        sessionId: z.uuid(),
        recordId: z.uuid()
    })
    .strict();

export const getAgentSessionResultRequestParser = {
    parseParams: (data: unknown) => paramsSchema.parse(data),
    parseQuery: (data: unknown) => querySchema.parse(data)
};
