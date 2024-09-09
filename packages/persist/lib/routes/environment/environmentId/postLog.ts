import { z } from 'zod';
import type { ApiError, Endpoint, MessageRowInsert } from '@nangohq/types';
import type { EndpointRequest, EndpointResponse, RouteHandler, Route } from '@nangohq/utils';
import { validateRequest } from '@nangohq/utils';
import { logContextGetter, oldLevelToNewLevel } from '@nangohq/logs';

type LegacyLogLevel = 'info' | 'debug' | 'error' | 'warn' | 'http' | 'verbose' | 'silly';

const MAX_LOG_CHAR = 10000;

interface LegacyLogBody {
    activityLogId: string;
    level: LegacyLogLevel;
    msg: string;
    timestamp?: number | undefined;
}
const legacyLogBodySchema = z.object({
    activityLogId: z.string(),
    level: z.enum(['info', 'debug', 'error', 'warn', 'http', 'verbose', 'silly']),
    msg: z.string(),
    timestamp: z.number().optional()
});

interface LogBody {
    activityLogId: string;
    log: MessageRowInsert;
}

export const logBodySchema = z.object({
    activityLogId: z.string(),
    log: z.object({
        type: z.enum(['log', 'http']),
        message: z.string(),
        source: z.enum(['internal', 'user']).optional().default('internal'),
        level: z.enum(['debug', 'info', 'warn', 'error']),
        title: z.string().nullable().optional().default(null),
        state: z.enum(['waiting', 'running', 'success', 'failed', 'timeout', 'cancelled']).optional().default('waiting'),
        code: z.enum(['success']).nullable().optional().default(null),
        accountId: z.number().nullable().optional().default(null),
        accountName: z.string().nullable().optional().default(null),
        environmentId: z.number().nullable().optional().default(null),
        environmentName: z.string().nullable().optional().default(null),
        providerName: z.string().nullable().optional().default(null),
        integrationId: z.number().nullable().optional().default(null),
        integrationName: z.string().nullable().optional().default(null),
        connectionId: z.number().nullable().optional().default(null),
        connectionName: z.string().nullable().optional().default(null),
        syncConfigId: z.number().nullable().optional().default(null),
        syncConfigName: z.string().nullable().optional().default(null),
        jobId: z.string().nullable().optional().default(null),
        userId: z.number().nullable().optional().default(null),
        error: z
            .object({
                name: z.string(),
                message: z.string(),
                type: z.string().nullable().optional().default(null),
                payload: z.any().optional()
            })
            .nullable()
            .optional()
            .default(null),
        request: z
            .object({
                url: z.string(),
                method: z.string(),
                headers: z.record(z.string())
            })
            .nullable()
            .optional()
            .default(null),
        response: z
            .object({
                code: z.number(),
                headers: z.record(z.string())
            })
            .nullable()
            .optional()
            .default(null),
        meta: z.record(z.any()).nullable().optional().default(null),
        createdAt: z.string()
    })
});

type PostLog = Endpoint<{
    Method: typeof method;
    Path: typeof path;
    Params: {
        environmentId: number;
    };
    Body: LegacyLogBody | LogBody;
    Error: ApiError<'post_log_failed'>;
    Success: never;
}>;

export const path = '/environment/:environmentId/log';
const method = 'POST';

const validate = validateRequest<PostLog>({
    parseBody: (data) => {
        const legacyParse = legacyLogBodySchema.strict().safeParse(data);
        if (legacyParse.success) {
            return legacyParse.data;
        }
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
    const {
        params: { environmentId },
        body
    } = req;

    const truncate = (str: string) => (str.length > MAX_LOG_CHAR ? `${str.substring(0, MAX_LOG_CHAR)}... (truncated)` : str);

    let log: MessageRowInsert;
    if ('log' in body) {
        log = {
            ...body.log,
            message: truncate(body.log.message)
        };
    } else {
        const { level, msg, timestamp } = body;
        log = {
            type: 'log',
            message: truncate(msg),
            environmentId: environmentId,
            level: oldLevelToNewLevel[level],
            source: 'user',
            createdAt: (timestamp ? new Date(timestamp) : new Date()).toISOString()
        };
    }
    const logCtx = logContextGetter.getStateLess({ id: String(body.activityLogId) }, { logToConsole: false });
    const result = await logCtx.log(log);
    if (result) {
        res.status(204).send();
    } else {
        res.status(500).json({ error: { code: 'post_log_failed', message: `Failed to save log ${body.activityLogId}` } });
    }
    return;
};

export const route: Route<PostLog> = { path, method };

export const routeHandler: RouteHandler<PostLog> = {
    ...route,
    validate,
    handler
};
