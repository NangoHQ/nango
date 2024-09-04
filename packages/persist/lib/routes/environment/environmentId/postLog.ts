import { z } from 'zod';
import type { ApiError, Endpoint } from '@nangohq/types';
import type { EndpointRequest, EndpointResponse, RouteHandler, Route } from '@nangohq/utils';
import { validateRequest } from '@nangohq/utils';
import { logContextGetter, oldLevelToNewLevel } from '@nangohq/logs';

type LegacyLogLevel = 'info' | 'debug' | 'error' | 'warn' | 'http' | 'verbose' | 'silly';

const MAX_LOG_CHAR = 10000;

type PostLog = Endpoint<{
    Method: typeof method;
    Path: typeof path;
    Params: {
        environmentId: number;
    };
    Body: {
        activityLogId: string;
        level: LegacyLogLevel;
        msg: string;
        timestamp?: number | undefined;
    };
    Error: ApiError<'post_log_failed'>;
    Success: never;
}>;

export const path = '/environment/:environmentId/log';
const method = 'POST';

const validate = validateRequest<PostLog>({
    parseBody: (data) =>
        z
            .object({
                activityLogId: z.string(),
                level: z.enum(['info', 'debug', 'error', 'warn', 'http', 'verbose', 'silly']),
                msg: z.string(),
                timestamp: z.number().optional()
            })
            .strict()
            .parse(data),
    parseParams: (data) =>
        z
            .object({
                environmentId: z.coerce.number().int().positive()
            })
            .strict()
            .parse(data)
});

const handler = async (req: EndpointRequest<PostLog>, res: EndpointResponse<PostLog>) => {
    const {
        params: { environmentId },
        body: { activityLogId, level, msg, timestamp }
    } = req;
    const truncatedMsg = msg.length > MAX_LOG_CHAR ? `${msg.substring(0, MAX_LOG_CHAR)}... (truncated)` : msg;
    const logCtx = logContextGetter.getStateLess({ id: String(activityLogId) }, { logToConsole: false });
    const result = await logCtx.log({
        type: 'log',
        message: truncatedMsg,
        environmentId: environmentId,
        level: oldLevelToNewLevel[level],
        source: 'user',
        createdAt: (timestamp ? new Date(timestamp) : new Date()).toISOString()
    });

    if (result) {
        res.status(204).send();
    } else {
        res.status(500).json({ error: { code: 'post_log_failed', message: `Failed to save log ${activityLogId}` } });
    }
    return;
};

export const route: Route<PostLog> = { path, method };

export const routeHandler: RouteHandler<PostLog> = {
    ...route,
    validate,
    handler
};
