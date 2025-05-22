import { isAsyncFunction } from 'util/types';

import tracer from 'dd-trace';

import { metrics } from '@nangohq/utils';

import type { RequestLocals } from './express.js';
import type { Endpoint } from '@nangohq/types';
import type { NextFunction, Request, RequestHandler, Response } from 'express';

export function asyncWrapper<TEndpoint extends Endpoint<any>, Locals extends Record<string, any> = Required<RequestLocals>>(
    fn: (
        req: Request<TEndpoint['Params'], TEndpoint['Reply'], TEndpoint['Body'], TEndpoint['Querystring']>,
        res: Response<TEndpoint['Reply'], Locals>,
        next: NextFunction
    ) => Promise<void> | void
): RequestHandler<any, TEndpoint['Reply'], any, any, any> {
    return (req, res, next) => {
        const active = tracer.scope().active();
        if (active) {
            active.setTag('http.route', req.route?.path || req.originalUrl);
            const contentLength = req.header('content-length');
            if (contentLength) {
                const int = parseInt(contentLength, 10);
                active.setTag('http.request.body.size', int);
                metrics.histogram(metrics.Types.API_REQUEST_CONTENT_LENGTH, int);
            }
        }

        if (isAsyncFunction(fn)) {
            return (fn(req, res, next) as unknown as Promise<any>).catch((err: unknown) => {
                next(err);
            });
        } else {
            return fn(req, res, next);
        }
    };
}
