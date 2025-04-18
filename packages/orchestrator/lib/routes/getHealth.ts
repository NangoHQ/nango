import type { Endpoint } from '@nangohq/types';
import type { RouteHandler } from '@nangohq/utils';

type Health = Endpoint<{
    Method: typeof method;
    Path: typeof path;
    Success: { status: 'ok' };
}>;

const path = '/health';
const method = 'GET';

export const routeHandler: RouteHandler<Health> = {
    path,
    method,
    validate: (_req, _res, next) => next(), // No extra validation needed
    handler: (_req, res) => {
        res.status(200).json({ status: 'ok' });
    }
};
