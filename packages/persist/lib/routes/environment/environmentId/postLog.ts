import { z } from 'zod';
import type { MessageRowInsert, PostLog } from '@nangohq/types';
import type { EndpointRequest, EndpointResponse, RouteHandler, Route } from '@nangohq/utils';
import { validateRequest } from '@nangohq/utils';
import { logContextGetter } from '@nangohq/logs';

const MAX_LOG_CHAR = 10000;

export const logBodySchema = z.object({
    activityLogId: z.string(),
    log: z.object({
        type: z.enum(['log', 'http']),
        message: z.string(),
        source: z.enum(['internal', 'user']).optional().default('internal'),
        level: z.enum(['debug', 'info', 'warn', 'error']),
        error: z
            .object({
                name: z.string(),
                message: z.string(),
                type: z.string().optional(),
                payload: z.any().optional()
            })
            .optional(),
        request: z
            .object({
                url: z.string(),
                method: z.string(),
                headers: z.record(z.string())
            })
            .optional(),
        response: z
            .object({
                code: z.number(),
                headers: z.record(z.string())
            })
            .optional(),
        meta: z.record(z.any()).optional().nullable(),
        createdAt: z.string(),
        endedAt: z.string().optional(),
        retry: z.object({ max: z.number(), waited: z.number(), attempt: z.number() }).optional()
    })
});

const validate = validateRequest<PostLog>({
    parseBody: (data) => {
        return logBodySchema.strict().parse(data);
    },
    parseParams: (data) =>
        z
            .object({
                environmentId: z.coerce.number().int().positive()
            })
            .strict()
            .parse(data)
});

const handler = async (req: EndpointRequest<PostLog>, res: EndpointResponse<PostLog>) => {
    const { body } = req;

    const truncate = (str: string) => (str.length > MAX_LOG_CHAR ? `${str.substring(0, MAX_LOG_CHAR)}... (truncated)` : str);

    const log: MessageRowInsert = {
        ...body.log,
        message: truncate(body.log.message)
    };
    const logCtx = logContextGetter.getStateLess({ id: String(body.activityLogId) }, { logToConsole: false });
    const result = await logCtx.log(log);
    if (result) {
        res.status(204).send();
    } else {
        res.status(500).json({ error: { code: 'post_log_failed', message: `Failed to save log ${body.activityLogId}` } });
    }
    return;
};

export const route: Route<PostLog> = { method: 'POST', path: '/environment/:environmentId/log' };

export const routeHandler: RouteHandler<PostLog> = {
    ...route,
    validate,
    handler
};
