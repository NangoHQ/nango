import tracer from 'dd-trace';
import type { Endpoint } from '@nangohq/types';
import type { RequestHandler, Request, Response, NextFunction } from 'express';
import { isAsyncFunction } from 'util/types';
import type { RequestLocals } from './express.js';

export function asyncWrapper<TEndpoint extends Endpoint<any>, Locals extends Record<string, any> = Required<RequestLocals>>(
    fn: (
        req: Request<TEndpoint['Params'], TEndpoint['Reply'], TEndpoint['Body'], TEndpoint['Querystring']>,
        res: Response<TEndpoint['Reply'], Locals>,
        next: NextFunction
    ) => Promise<void> | void
): RequestHandler<any, TEndpoint['Reply'], TEndpoint['Body'], TEndpoint['Querystring'], Locals> {
    return (req, res, next) => {
        const active = tracer.scope().active();
        active?.setTag('http.route', req.route?.path || req.originalUrl);
        if (isAsyncFunction(fn)) {
            return (fn(req, res, next) as unknown as Promise<any>).catch((err: unknown) => {
                next(err);
            }) as unknown;
        } else {
            return fn(req, res, next);
        }
    };
}
