import type { Endpoint } from '@nangohq/types';
import type { RouteHandler } from '@nangohq/utils';
import type { AuthLocals } from '../middleware/auth.middleware';

type Health = Endpoint<{
    Method: typeof method;
    Path: typeof path;
    Success: { status: 'ok' };
}>;

const path = '/health';
const method = 'GET';

export const routeHandler: RouteHandler<Health, AuthLocals> = {
    path,
    method,
    validate: (_req, _res, next) => next(),
    handler: (_req, res) => {
        res.status(200).json({ status: 'ok' });
    }
};
