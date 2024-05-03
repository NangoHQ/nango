import type { Account, Environment, User } from '@nangohq/shared';
import type { Endpoint } from '@nangohq/types';
import type { RequestHandler, Request, Response, NextFunction } from 'express';
import { isAsyncFunction } from 'util/types';

export interface RequestLocals {
    authType?: 'secretKey' | 'publicKey' | 'basic' | 'adminKey' | 'none' | 'session';
    user?: Pick<User, 'id' | 'email'>;
    account?: Account;
    environment?: Environment;
}

export function asyncWrapper<TEndpoint extends Endpoint<any>>(
    fn: (
        req: Request<TEndpoint['Params'], TEndpoint['Reply'], TEndpoint['Body'], TEndpoint['Querystring']>,
        res: Response<TEndpoint['Reply'], RequestLocals>,
        next: NextFunction
    ) => Promise<void> | void
): RequestHandler<any, TEndpoint['Reply'], TEndpoint['Body'], TEndpoint['Querystring'], RequestLocals> {
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
