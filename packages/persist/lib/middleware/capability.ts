import {
    hasScope,
    INTERNAL_SERVICE_AUDIENCE_PERSIST,
    INTERNAL_SERVICE_ISSUER_JOBS,
    isResourceBound,
    isTaskBoundAuth,
    jwtHeaderAlg,
    keyRegistryFromPublicKeys,
    verifyTaskCapabilityToken
} from '@nangohq/internal-auth';
import { accountService } from '@nangohq/shared';
import { createRoute, ENVS, parseEnvs, stringifyError } from '@nangohq/utils';

import { applyPersistAuthContext, authenticateSecret } from './auth.middleware.js';
import { connectionOwnershipMiddleware } from './connectionOwnership.middleware.js';

import type { AuthLocals } from './auth.middleware.js';
import type { TaskCapabilityScope } from '@nangohq/internal-auth';
import type { Endpoint } from '@nangohq/types';
import type { RouteHandler } from '@nangohq/utils';
import type { Express, NextFunction, Request, RequestHandler, Response } from 'express';

// Built once at process start. Verification receives this registry and never builds one per request.
const jobsRegistry = keyRegistryFromPublicKeys(parseEnvs(ENVS).NANGO_INTERNAL_AUTH_JOBS_PUBLIC_KEYS, INTERNAL_SERVICE_ISSUER_JOBS);

export interface PersistRouteOptions {
    /** Sync-conflict routes carry syncId in the body, not the path. */
    syncIdFromBody?: boolean;
    /** Runs after auth, so a bad secret is rejected before the body is parsed. */
    parseJson?: RequestHandler;
}

/**
 * Registers a persist route with its capability scope. `null` rejects task tokens and does not
 * require a secret. The Express app is an argument because the server object is created in server.ts.
 */
export function createPersistRoute<E extends Endpoint<any>>(
    app: Express,
    handler: RouteHandler<E, AuthLocals>,
    scope: TaskCapabilityScope | null,
    opts?: PersistRouteOptions
): void {
    const middleware: RequestHandler[] = [persistCapability(scope, handler.path, opts)];
    if (String(handler.path).includes(':nangoConnectionId')) {
        middleware.push(connectionOwnershipMiddleware as RequestHandler);
    }
    if (opts?.parseJson) {
        middleware.push(opts.parseJson);
    }
    createRoute(app, handler, { middleware });
}

function persistCapability(scope: TaskCapabilityScope | null, path: string, opts: PersistRouteOptions | undefined): RequestHandler {
    return (req, res, next) => {
        const authRes = res as Response<unknown, AuthLocals>;
        const token = eddsaBearer(req);
        if (token) {
            void authenticateTask(req, authRes, next, token, scope, path, opts);
            return;
        }
        if (scope === null) {
            next();
            return;
        }
        void authenticateSecret(req, authRes, next);
    };
}

async function authenticateTask(
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
        const auth = await verifyTaskCapabilityToken(token, INTERNAL_SERVICE_AUDIENCE_PERSIST, jobsRegistry);
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

function eddsaBearer(req: Request): string | undefined {
    const header = req.get('authorization');
    if (!header) {
        return undefined;
    }
    const secret = header.split('Bearer ').pop();
    if (!secret || jwtHeaderAlg(secret) !== 'EdDSA') {
        return undefined;
    }
    return secret;
}

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

function unauthorized(res: Response): void {
    res.status(401).json({ error: { code: 'unauthorized', message: 'Unauthorized' } });
}
