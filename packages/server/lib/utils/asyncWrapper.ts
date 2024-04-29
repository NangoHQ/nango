import type { RequestHandler } from 'express';
import { isAsyncFunction } from 'util/types';

export function asyncWrapper<ResBody = undefined, ReqBody = undefined>(fn: RequestHandler<any, ResBody, ReqBody>): RequestHandler<any, ResBody, ReqBody> {
    if (isAsyncFunction(fn)) {
        return (req, res, next) => {
            return (fn(req, res, next) as unknown as Promise<any>).catch((err) => {
                next(err);
            }) as unknown;
        };
    } else {
        return fn;
    }
}
