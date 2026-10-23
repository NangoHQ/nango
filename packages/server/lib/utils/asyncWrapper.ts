import { isAsyncFunction } from 'util/types';

import tracer from 'dd-trace';

import { metrics, report } from '@nangohq/utils';

import type { RequestLocals, RequestLocalsWithAnyEnvironment, RequestLocalsWithEnvironment } from './express.js';
import type { DBEnvironment, Endpoint, EnvironmentWithoutSecrets } from '@nangohq/types';
import type { NextFunction, Request, RequestHandler, Response } from 'express';

export function asyncWrapper<TEndpoint extends Endpoint<any>, Locals extends Record<string, any> = RequestLocals>(
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

/**
 * asyncWrapper for environment-scoped handlers: resolves the environment once and narrows it, so the
 * handler can use `res.locals.environment` directly.
 */
export function asyncWrapperWithEnvironment<TEndpoint extends Endpoint<any>>(
    fn: (
        req: Request<TEndpoint['Params'], TEndpoint['Reply'], TEndpoint['Body'], TEndpoint['Querystring']>,
        res: Response<TEndpoint['Reply'], RequestLocalsWithEnvironment>,
        next: NextFunction
    ) => Promise<void> | void
): RequestHandler<any, TEndpoint['Reply'], any, any, any> {
    // Must be async so asyncWrapper attaches its .catch(next).
    return asyncWrapper<TEndpoint>(async (req, res, next) => {
        if (!requireDbEnvironment(req, res)) {
            return;
        }

        await fn(req, res as Response<TEndpoint['Reply'], RequestLocalsWithEnvironment>, next);
    });
}

/**
 * Returns the request's environment, or null *after having responded* 500 if it has none.
 *
 * No environment means an environment-scoped handler was wired to a route that resolves none, which
 * is a wiring mistake rather than a client error.
 */
export function requireEnvironment(req: Request, res: Response<any, RequestLocals>): DBEnvironment | EnvironmentWithoutSecrets | null {
    const { environment } = res.locals;
    if (!environment) {
        report(new Error('handler_requires_environment'), { route: req.route?.path ?? req.originalUrl });
        res.status(500).send({ error: { code: 'server_error' } });
        return null;
    }

    return environment;
}

/** A task-token request loads no secret columns. Every other auth path keeps the environment it loaded. */
export function isTaskTokenRequest(locals: Pick<RequestLocals, 'authType'>): boolean {
    return locals.authType === 'taskToken';
}

/**
 * Same as {@link asyncWrapperWithEnvironment}, for routes that also accept a task capability token.
 * The handler sees `DBEnvironment | EnvironmentWithoutSecrets` because a task token never loads secrets.
 */
export function asyncWrapperWithAnyEnvironment<TEndpoint extends Endpoint<any>>(
    fn: (
        req: Request<TEndpoint['Params'], TEndpoint['Reply'], TEndpoint['Body'], TEndpoint['Querystring']>,
        res: Response<TEndpoint['Reply'], RequestLocalsWithAnyEnvironment>,
        next: NextFunction
    ) => Promise<void> | void
): RequestHandler<any, TEndpoint['Reply'], any, any, any> {
    return asyncWrapper<TEndpoint>(async (req, res, next) => {
        if (!requireEnvironment(req, res)) {
            return;
        }

        await fn(req, res as Response<TEndpoint['Reply'], RequestLocalsWithAnyEnvironment>, next);
    });
}

/**
 * Like `requireEnvironment`, and refuses a task-token request. Those requests load no secret columns.
 * Every other auth path is returned as the environment it loaded.
 */
export function requireDbEnvironment(req: Request, res: Response<any, RequestLocals>): DBEnvironment | null {
    const environment = requireEnvironment(req, res);
    if (!environment) {
        return null;
    }
    if (isTaskTokenRequest(res.locals)) {
        report(new Error('handler_requires_environment_secrets'), { route: req.route?.path ?? req.originalUrl });
        res.status(500).send({ error: { code: 'server_error' } });
        return null;
    }
    return environment as DBEnvironment;
}
