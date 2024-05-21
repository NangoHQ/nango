import type { Endpoint } from '@nangohq/types';
import type { RouteHandler } from '@nangohq/utils';

type Health = Endpoint<{
    Method: typeof method;
    Path: typeof path;
    Success: { status: 'ok' };
}>;

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
