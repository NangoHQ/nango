import type { ApiError } from '@nangohq/types';
import type { RouteHandler } from '@nangohq/utils';

interface Health {
    Method: typeof method;
    Path: typeof path;
    Error: ApiError<'health_failed'>;
    Success: { status: 'ok' };
}

const path = '/health';
const method = 'GET';

export const handler: RouteHandler<Health> = {
    path,
    method,
    validate: (_req, _res, next) => {
        // No validation needed
        next();
    },
    handler: (_req, res) => res.json({ status: 'ok' })
};
