import { hasScope, INTERNAL_SERVICE_AUDIENCE_PERSIST, isResourceBound, isTaskBoundAuth, routeParam, verifyTaskCapabilityToken } from '@nangohq/internal-auth';
import { accountService } from '@nangohq/shared';
import { stringifyError } from '@nangohq/utils';

import { applyPersistAuthContext, authenticateSecret, eddsaBearerToken } from './auth.middleware.js';

import type { AuthLocals } from './auth.middleware.js';
import type { KeyRegistry, TaskCapabilityAuth, TaskCapabilityScope } from '@nangohq/internal-auth';
import type { NextFunction, Request, RequestHandler, Response } from 'express';

export type PersistCredential = { kind: 'secret' } | { kind: 'task'; auth: TaskCapabilityAuth };

/** `credential` is absent until `authenticate` has accepted the caller. */
export type PersistLocals = AuthLocals & { credential?: PersistCredential };

const KNOWN_PARAMS = new Set(['environmentId', 'nangoConnectionId', 'syncId', 'syncJobId', 'taskId']);

/**
 * Credential check for every `/environment/:environmentId` route. Mount before any JSON parser.
 * Scope and the other resource bindings run in `authorize`, after Express has matched the route.
 */
export function authenticate(registry: KeyRegistry): RequestHandler {
    return (req, res, next) => {
        const token = eddsaBearerToken(req.get('authorization'));
        if (token) {
            void authenticateTask(registry, req, res as Response<unknown, PersistLocals>, next, token);
            return;
        }
        void authenticateSecret(req, res as Response<unknown, AuthLocals>, next, () => {
            (res as Response<unknown, PersistLocals>).locals.credential = { kind: 'secret' };
        });
    };
}

async function authenticateTask(registry: KeyRegistry, req: Request, res: Response<unknown, PersistLocals>, next: NextFunction, token: string): Promise<void> {
    try {
        const auth = await verifyTaskCapabilityToken(token, INTERNAL_SERVICE_AUDIENCE_PERSIST, registry);
        if (!auth) {
            unauthorized(res);
            return;
        }
        if (!isResourceBound(auth, 'environmentId', positiveInt(routeParam(req, 'environmentId')))) {
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
        res.locals.credential = { kind: 'task', auth };
        next();
    } catch (err) {
        res.status(401).json({ error: { code: 'unauthorized', message: `Unauthorized: ${stringifyError(err)}` } });
    }
}

/** Scope and path-param bindings. Runs before the route's JSON parser, so it does not read the body. */
export function authorize(scope: TaskCapabilityScope): RequestHandler {
    return (req, res, next) => {
        if (unknownParam(req)) {
            invalidRouteParam(res);
            return;
        }
        const credential = (res as Response<unknown, PersistLocals>).locals.credential;
        if (!credential) {
            unauthorized(res);
            return;
        }
        if (credential.kind === 'secret') {
            next();
            return;
        }
        authorizeTask(credential.auth, req, scope, res, next);
    };
}

function authorizeTask(auth: TaskCapabilityAuth, req: Request, scope: TaskCapabilityScope, res: Response, next: NextFunction): void {
    if (!hasScope(auth, scope)) {
        unauthorized(res);
        return;
    }
    const connectionId = routeParam(req, 'nangoConnectionId');
    if (connectionId !== undefined && !isResourceBound(auth, 'connectionId', positiveInt(connectionId))) {
        unauthorized(res);
        return;
    }
    const syncId = routeParam(req, 'syncId');
    if (syncId !== undefined && !isResourceBound(auth, 'syncId', syncId)) {
        unauthorized(res);
        return;
    }
    const taskId = routeParam(req, 'taskId');
    if (taskId !== undefined && !isTaskBoundAuth(auth, taskId)) {
        unauthorized(res);
        return;
    }
    next();
}

/** Sync-conflict routes carry syncId in the body. Run this after the JSON parser. */
export const authorizeBodySyncId: RequestHandler = (req, res, next) => {
    const credential = (res as Response<unknown, PersistLocals>).locals.credential;
    if (!credential) {
        unauthorized(res);
        return;
    }
    if (credential.kind === 'secret') {
        next();
        return;
    }
    if (!isResourceBound(credential.auth, 'syncId', bodySyncId(req.body))) {
        unauthorized(res);
        return;
    }
    next();
};

/** Routes that never accept a task token, such as `/health`. */
export const rejectTaskCredential: RequestHandler = (req, res, next) => {
    if (eddsaBearerToken(req.get('authorization'))) {
        unauthorized(res);
        return;
    }
    next();
};

function unknownParam(req: Request): boolean {
    return Object.keys(req.params).some((key) => !KNOWN_PARAMS.has(key));
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

function invalidRouteParam(res: Response): void {
    res.status(400).json({ error: { code: 'invalid_route_param', message: 'Invalid route parameter' } });
}
