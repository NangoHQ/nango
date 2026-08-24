import { isAsyncFunction } from 'util/types';

import tracer from 'dd-trace';

import { metrics, report } from '@nangohq/utils';

import type { Claimed } from './audited.js';
import type { RequestLocals, RequestLocalsWithEnvironment } from './express.js';
import type { AuditClaimOf, DBEnvironment, Endpoint } from '@nangohq/types';
import type { NextFunction, Request, RequestHandler, Response } from 'express';

// `unknown` arm first: `AuditClaimOf<any>` widens to `unknown`, so without it every `asyncWrapper<any>`
// handler would look like it owes a claim and lose its success body.
type ClaimRequired<TEndpoint> = unknown extends AuditClaimOf<TEndpoint> ? false : AuditClaimOf<TEndpoint> extends never ? false : true;

/**
 * When the endpoint's audit policy declares a claim, its success body is only accepted in the branded form
 * `claimAudit` returns, so a success that says nothing about what happened does not compile. Errors are
 * untouched, and no response method is withdrawn.
 */
type AuditedBody<TEndpoint extends Endpoint<any>> =
    ClaimRequired<TEndpoint> extends true ? Exclude<TEndpoint['Reply'], TEndpoint['Success']> | Claimed<TEndpoint['Success']> : TEndpoint['Reply'];
type EndpointResponse<TEndpoint extends Endpoint<any>, Locals extends Record<string, any>> = Response<AuditedBody<TEndpoint>, Locals>;

export function asyncWrapper<TEndpoint extends Endpoint<any>, Locals extends Record<string, any> = RequestLocals>(
    fn: (
        req: Request<TEndpoint['Params'], TEndpoint['Reply'], TEndpoint['Body'], TEndpoint['Querystring']>,
        res: EndpointResponse<TEndpoint, Locals>,
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
            return (fn(req, res as EndpointResponse<TEndpoint, Locals>, next) as unknown as Promise<any>).catch((err: unknown) => {
                next(err);
            });
        } else {
            return fn(req, res as EndpointResponse<TEndpoint, Locals>, next);
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
        res: EndpointResponse<TEndpoint, RequestLocalsWithEnvironment>,
        next: NextFunction
    ) => Promise<void> | void
): RequestHandler<any, TEndpoint['Reply'], any, any, any> {
    // Must be async so asyncWrapper attaches its .catch(next).
    return asyncWrapper<TEndpoint>(async (req, res, next) => {
        if (!requireEnvironment(req, res)) {
            return;
        }

        await fn(req, res as EndpointResponse<TEndpoint, RequestLocalsWithEnvironment>, next);
    });
}

/**
 * Returns the request's environment, or null *after having responded* 500 if it has none.
 *
 * No environment means an environment-scoped handler was wired to a route that resolves none, which
 * is a wiring mistake rather than a client error.
 */
export function requireEnvironment(req: Request, res: Response<any, RequestLocals>): DBEnvironment | null {
    const { environment } = res.locals;
    if (!environment) {
        report(new Error('handler_requires_environment'), { route: req.route?.path ?? req.originalUrl });
        res.status(500).send({ error: { code: 'server_error' } });
        return null;
    }

    return environment;
}
