import type { Endpoint } from '@nangohq/types';
import type { RequestHandler, Request, Response, NextFunction } from 'express';
import { isAsyncFunction } from 'util/types';
import type { RequestLocals } from './express';

export function asyncWrapper<TEndpoint extends Endpoint<any>>(
    fn: (
        req: Request<TEndpoint['Params'], TEndpoint['Reply'], TEndpoint['Body'], TEndpoint['Querystring']>,
        res: Response<TEndpoint['Reply'], Required<RequestLocals>>,
        next: NextFunction
    ) => Promise<void> | void
): RequestHandler<any, TEndpoint['Reply'], TEndpoint['Body'], TEndpoint['Querystring'], Required<RequestLocals>> {
    if (isAsyncFunction(fn)) {
        return (req, res, next) => {
            return (fn(req, res, next) as unknown as Promise<any>).catch((err: unknown) => {
                next(err);
            }) as unknown;
        };
    } else {
        return fn;
    }
}
