import { hasScope, INTERNAL_SERVICE_AUDIENCE_PERSIST, isResourceBound, isTaskBoundAuth, verifyTaskCapabilityToken } from '@nangohq/internal-auth';
import { accountService } from '@nangohq/shared';
import { createRoute, stringifyError } from '@nangohq/utils';

import { applyPersistAuthContext, authenticateSecret, eddsaBearerToken } from './auth.middleware.js';
import { connectionOwnershipMiddleware } from './connectionOwnership.middleware.js';

import type { AuthLocals } from './auth.middleware.js';
import type { KeyRegistry, TaskCapabilityScope } from '@nangohq/internal-auth';
import type { Endpoint } from '@nangohq/types';
import type { RouteHandler } from '@nangohq/utils';
import type { Express, NextFunction, Request, RequestHandler, Response } from 'express';

/** Set on the capability middleware so server startup can reject a route that skipped `createPersistRoute`. */
export const PERSIST_CAPABILITY: unique symbol = Symbol('persistCapability');

export interface PersistRouteOptions {
    /** Sync-conflict routes carry syncId in the body, not the path. */
    syncIdFromBody?: boolean;
    /** Runs after auth, so a bad secret is rejected before the body is parsed. */
    parseJson?: RequestHandler;
}

/**
 * Returns `createPersistRoute` bound to a jobs key registry. The caller builds that registry once
 * and passes it in; verification never builds one per request.
 */
export function createPersistRoutes(registry: KeyRegistry) {
    return function createPersistRoute<E extends Endpoint<any>>(
        app: Express,
        handler: RouteHandler<E, AuthLocals>,
        scope: TaskCapabilityScope | null,
        opts?: PersistRouteOptions
    ): void {
        const middleware: RequestHandler[] = [persistCapability(registry, scope, String(handler.path), opts)];
        if (String(handler.path).includes(':nangoConnectionId')) {
            middleware.push(connectionOwnershipMiddleware as RequestHandler);
        }
        if (opts?.parseJson) {
            middleware.push(opts.parseJson);
        }
        createRoute(app, handler, { middleware });
    };
}

function persistCapability(registry: KeyRegistry, scope: TaskCapabilityScope | null, path: string, opts: PersistRouteOptions | undefined): RequestHandler {
    const middleware: RequestHandler = (req, res, next) => {
        const authRes = res as Response<unknown, AuthLocals>;
        const token = eddsaBearerToken(req.get('authorization'));
        if (token) {
            void authenticateTask(registry, req, authRes, next, token, scope, path, opts);
            return;
        }
        if (scope === null) {
            next();
            return;
        }
        void authenticateSecret(req, authRes, next);
    };
    (middleware as RequestHandler & { [PERSIST_CAPABILITY]?: true })[PERSIST_CAPABILITY] = true;
    return middleware;
}

async function authenticateTask(
    registry: KeyRegistry,
    req: Request,
    res: Response<unknown, AuthLocals>,
    next: NextFunction,
    token: string,
    scope: TaskCapabilityScope | null,
    path: string,
    opts: PersistRouteOptions | undefined
): Promise<void> {
    if (scope === null) {
        unauthorized(res);
        return;
    }

    try {
        const auth = await verifyTaskCapabilityToken(token, INTERNAL_SERVICE_AUDIENCE_PERSIST, registry);
        if (!auth || !hasScope(auth, scope)) {
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

// Copied from the private helper in internal-auth/lib/middleware.ts. That package does not export it.
function routeParam(req: Request, name: string): string | undefined {
    const value = req.params[name];
    return typeof value === 'string' && value.length > 0 ? value : undefined;
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

// Copied from the private helper in internal-auth/lib/middleware.ts. That package does not export it.
function unauthorized(res: Response): void {
    res.status(401).json({ error: { code: 'unauthorized', message: 'Unauthorized' } });
}
