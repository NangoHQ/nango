import * as z from 'zod';

import { apiSchemaRegistry } from './schema.js';

import type { FastifyReply, RawServerDefault, RouteGenericInterface } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { IncomingMessage, ServerResponse } from 'http';

export const schemaNotFound = z.object({
    error: z.strictObject({
        code: z.literal('not_found'),
        errorId: z.uuid().optional(),
        message: z.string()
    })
});

export const schemaServerError = z.object({
    error: z.strictObject({
        code: z.literal('server_error'),
        errorId: z.uuid().optional(),
        message: z.string()
    })
});

export const schemaUnauthorized = z.object({
    error: z.strictObject({
        code: z.literal('unauthorized'),
        message: z.string()
    })
});

apiSchemaRegistry.add(schemaNotFound, { id: 'ResponseNotFound' });
apiSchemaRegistry.add(schemaServerError, { id: 'ResponseServerError' });
apiSchemaRegistry.add(schemaUnauthorized, { id: 'ResponseUnauthorized' });

type FastifyReplyError<TCode extends number, TError extends z.ZodObject<any>> = FastifyReply<
    RouteGenericInterface,
    RawServerDefault,
    IncomingMessage,
    ServerResponse,
    unknown,
    {
        readonly response: Readonly<Record<TCode, TError>>;
    },
    ZodTypeProvider
>;

export async function resNotFound(res: FastifyReplyError<404, typeof schemaNotFound>, message?: string): Promise<void> {
    const err: z.infer<typeof schemaNotFound> = {
        error: {
            code: 'not_found',
            message: message ?? 'Not Found'
        }
    };
    return res.status(404).send(err);
}

export async function resServerError(res: FastifyReplyError<500, typeof schemaServerError>, message: string, errorId?: string): Promise<void> {
    const err: z.infer<typeof schemaServerError> = {
        error: {
            code: 'server_error',
            message,
            errorId
        }
    };
    return res.status(500).send(err);
}

export async function resUnauthorized(res: FastifyReplyError<401, typeof schemaUnauthorized>, message: string): Promise<void> {
    const err: z.infer<typeof schemaUnauthorized> = {
        error: {
            code: 'unauthorized',
            message: message ?? 'Unauthorized'
        }
    };
    return res.status(401).send(err);
}
