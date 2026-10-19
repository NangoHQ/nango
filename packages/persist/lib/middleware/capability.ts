import { getInternalServiceAuth, hasScope, INTERNAL_SERVICE_AUTH_LOCALS_KEY, isResourceBound, isTaskBoundAuth } from '@nangohq/internal-auth';

import type { InternalServiceAuth } from '@nangohq/internal-auth';
import type { NextFunction, Request, Response } from 'express';

function unauthorized(res: Response): void {
    res.status(401).json({ error: { code: 'unauthorized', message: 'Unauthorized' } });
}

function stringParam(req: Request, name: string): string | undefined {
    const value = req.params[name];
    return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function bodyString(req: Request, name: string): string | undefined {
    const body: unknown = req.body;
    if (typeof body !== 'object' || body === null) {
        return undefined;
    }
    const value = (body as Record<string, unknown>)[name];
    return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function positiveIntParam(req: Request, name: string): number | undefined {
    const raw = stringParam(req, name);
    if (raw === undefined) {
        return undefined;
    }
    const id = Number(raw);
    if (!Number.isInteger(id) || id <= 0 || !Number.isSafeInteger(id)) {
        return undefined;
    }
    return id;
}

export function setCapabilityAuth(res: Response, auth: InternalServiceAuth): void {
    res.locals[INTERNAL_SERVICE_AUTH_LOCALS_KEY] = auth;
}

const TASK_CAPABILITY_SATISFIED = 'taskCapabilitySatisfied';

/** Names of the request fields this route binds a task JWT to. Absent names are not checked. */
export interface TaskCapabilityParams {
    connectionId?: string;
    syncId?: string;
    taskId?: string;
    /** Body field whose string value must match `res.syncId`. */
    bodySyncId?: string;
}

/** Secret-key callers pass through. A task JWT must match the scope and the named path params. */
export function requireTaskCapability(scope: string, params: TaskCapabilityParams = {}) {
    return (req: Request, res: Response, next: NextFunction): void => {
        const auth = getInternalServiceAuth(res);
        if (!auth || auth.kind !== 'jwt') {
            next();
            return;
        }
        if (!hasScope(auth, scope)) {
            unauthorized(res);
            return;
        }
        if (params.connectionId !== undefined && !isResourceBound(auth, 'connectionId', positiveIntParam(req, params.connectionId))) {
            unauthorized(res);
            return;
        }
        if (params.syncId !== undefined && !isResourceBound(auth, 'syncId', stringParam(req, params.syncId))) {
            unauthorized(res);
            return;
        }
        if (params.taskId !== undefined && !isTaskBoundAuth(auth, stringParam(req, params.taskId))) {
            unauthorized(res);
            return;
        }
        if (params.bodySyncId !== undefined && !isResourceBound(auth, 'syncId', bodyString(req, params.bodySyncId))) {
            unauthorized(res);
            return;
        }
        res.locals[TASK_CAPABILITY_SATISFIED] = true;
        next();
    };
}

/**
 * Reject a task JWT that never passed `requireTaskCapability`. Secret-key requests pass.
 * Register it after that middleware on every persist route so a route that forgets the
 * capability check does not accept every task token for the environment.
 */
export function denyTaskTokenWithoutCapability(_req: Request, res: Response, next: NextFunction): void {
    const auth = getInternalServiceAuth(res);
    if (auth?.kind === 'jwt' && res.locals[TASK_CAPABILITY_SATISFIED] !== true) {
        unauthorized(res);
        return;
    }
    next();
}
