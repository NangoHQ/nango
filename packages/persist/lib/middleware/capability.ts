import { hasScope, INTERNAL_SERVICE_AUDIENCE_PERSIST, isResourceBound, isTaskBoundAuth, routeParam, verifyTaskCapabilityToken } from '@nangohq/internal-auth';
import { accountService } from '@nangohq/shared';
import { createRoute, stringifyError } from '@nangohq/utils';

import { applyPersistAuthContext, authenticateSecret, eddsaBearerToken } from './auth.middleware.js';
import { connectionOwnershipMiddleware } from './connectionOwnership.middleware.js';
import { syncJobOwnershipMiddleware } from './syncJobOwnership.middleware.js';

import type { AuthLocals } from './auth.middleware.js';
import type { KeyRegistry, TaskCapabilityAuth, TaskCapabilityScope } from '@nangohq/internal-auth';
import type { Endpoint } from '@nangohq/types';
import type { RouteHandler } from '@nangohq/utils';
import type { Express, NextFunction, Request, RequestHandler, Response } from 'express';

export interface PersistRouteOptions {
    /** Sync-conflict routes carry syncId in the body, not the path. Checked after the body is parsed. */
    syncIdFromBody?: boolean;
    /** Runs after authentication, so a bad credential is rejected before the body is parsed. */
    parseJson?: RequestHandler;
}

type PersistCredential = { kind: 'secret' } | { kind: 'task'; auth: TaskCapabilityAuth };

const credentialByResponse = new WeakMap<Response, PersistCredential>();

/**
 * Returns auth mounting and `createPersistRoute` bound to a jobs key registry. The caller builds
 * that registry once and passes it in; verification never builds one per request.
 *
 * `mountPersistAuth` must run before any `/environment/` route. It checks the credential only.
 * Scope and resource checks run on the route, after Express has matched the path and parsed the body.
 */
export function createPersistRoutes(registry: KeyRegistry) {
    let authMounted = false;
    return {
        mountPersistAuth(app: Express): void {
            app.use('/environment/:environmentId', authenticatePersist(registry));
            authMounted = true;
        },
        createPersistRoute<E extends Endpoint<any>>(
            app: Express,
            handler: RouteHandler<E, AuthLocals>,
            scope: TaskCapabilityScope | null,
            opts?: PersistRouteOptions
        ): void {
            if (!authMounted) {
                throw new Error('mountPersistAuth must be called before createPersistRoute');
            }
            const path = String(handler.path);
            if (scope !== null && !path.startsWith('/environment/')) {
                throw new Error(`persist route ${path} is outside /environment and cannot be authenticated`);
            }
            createRoute(app, handler, { middleware: routeMiddleware(scope, path, opts) });
        }
    };
}

function authenticatePersist(registry: KeyRegistry): RequestHandler {
    return (req, res, next) => {
        const token = eddsaBearerToken(req.get('authorization'));
        if (token) {
            void authenticateTaskCredential(registry, res, next, token);
            return;
        }
        void authenticateSecret(req, res as Response<unknown, AuthLocals>, next, () => {
            credentialByResponse.set(res, { kind: 'secret' });
        });
    };
}

async function authenticateTaskCredential(registry: KeyRegistry, res: Response, next: NextFunction, token: string): Promise<void> {
    try {
        const auth = await verifyTaskCapabilityToken(token, INTERNAL_SERVICE_AUDIENCE_PERSIST, registry);
        if (!auth) {
            unauthorized(res);
            return;
        }
        credentialByResponse.set(res, { kind: 'task', auth });
        next();
    } catch (err) {
        res.status(401).json({ error: { code: 'unauthorized', message: `Unauthorized: ${stringifyError(err)}` } });
    }
}

function routeMiddleware(scope: TaskCapabilityScope | null, path: string, opts: PersistRouteOptions | undefined): RequestHandler[] {
    const middleware: RequestHandler[] = [];
    if (scope === null) {
        middleware.push(rejectTaskCredential());
        return middleware;
    }
    if (opts?.parseJson) {
        middleware.push(opts.parseJson);
    }
    middleware.push(authorizePersist(scope, path, opts));
    if (path.includes(':nangoConnectionId')) {
        middleware.push(connectionOwnershipMiddleware as RequestHandler);
    }
    if (path.includes(':syncJobId')) {
        middleware.push(syncJobOwnershipMiddleware as RequestHandler);
    }
    return middleware;
}

function authorizePersist(scope: TaskCapabilityScope, path: string, opts: PersistRouteOptions | undefined): RequestHandler {
    return (req, res, next) => {
        const credential = credentialByResponse.get(res);
        if (credential?.kind === 'task') {
            void authorizeTask(credential.auth, req, scope, path, opts, res as Response<unknown, AuthLocals>, next);
            return;
        }
        if (credential?.kind === 'secret') {
            next();
            return;
        }
        unauthorized(res);
    };
}

async function authorizeTask(
    auth: TaskCapabilityAuth,
    req: Request,
    scope: TaskCapabilityScope,
    path: string,
    opts: PersistRouteOptions | undefined,
    res: Response<unknown, AuthLocals>,
    next: NextFunction
): Promise<void> {
    try {
        if (!hasScope(auth, scope)) {
            unauthorized(res);
            return;
        }
        const environmentId = positiveInt(routeParam(req, 'environmentId'));
        if (!isResourceBound(auth, 'environmentId', environmentId)) {
            unauthorized(res);
            return;
        }
        if (path.includes(':nangoConnectionId') && !isResourceBound(auth, 'connectionId', positiveInt(routeParam(req, 'nangoConnectionId')))) {
            unauthorized(res);
            return;
        }
        if (path.includes(':syncId') && !isResourceBound(auth, 'syncId', routeParam(req, 'syncId'))) {
            unauthorized(res);
            return;
        }
        if (path.includes(':taskId') && !isTaskBoundAuth(auth, routeParam(req, 'taskId'))) {
            unauthorized(res);
            return;
        }
        if (opts?.syncIdFromBody && !isResourceBound(auth, 'syncId', bodySyncId(req.body))) {
            unauthorized(res);
            return;
        }

        const result = await accountService.getPersistAuthContextByEnvironmentId(auth.res.environmentId);
        if (result.isErr()) {
            res.status(401).json({ error: { code: 'unauthorized', message: `Unauthorized: ${stringifyError(result.error)}` } });
            return;
        }
        if (!result.value) {
            res.status(401).json({ error: { code: 'unauthorized', message: 'Unauthorized: Account not found' } });
            return;
        }
        if (!applyPersistAuthContext(res, result.value)) {
            return;
        }
        next();
    } catch (err) {
        res.status(401).json({ error: { code: 'unauthorized', message: `Unauthorized: ${stringifyError(err)}` } });
    }
}

function rejectTaskCredential(): RequestHandler {
    return (req, res, next) => {
        if (eddsaBearerToken(req.get('authorization'))) {
            unauthorized(res);
            return;
        }
        next();
    };
}

function positiveInt(value: string | undefined): number | undefined {
    if (value === undefined) {
        return undefined;
    }
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed <= 0) {
        return undefined;
    }
    return parsed;
}

function bodySyncId(body: unknown): string | undefined {
    if (typeof body !== 'object' || body === null || !('syncId' in body)) {
        return undefined;
    }
    const syncId = body.syncId;
    return typeof syncId === 'string' ? syncId : undefined;
}

function unauthorized(res: Response): void {
    res.status(401).json({ error: { code: 'unauthorized', message: 'Unauthorized' } });
}
