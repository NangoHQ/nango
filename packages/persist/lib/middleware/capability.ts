import {
    getInternalServiceAuth,
    hasScope,
    INTERNAL_SERVICE_AUTH_LOCALS_KEY,
    isResourceBound,
    isTaskBoundAuth,
    routeParam,
    unauthorized
} from '@nangohq/internal-auth';

import type { InternalServiceAuth, TaskCapabilityScope } from '@nangohq/internal-auth';
import type { NextFunction, Request, Response } from 'express';

function bodyString(req: Request, name: string): string | undefined {
    const body: unknown = req.body;
    if (typeof body !== 'object' || body === null) {
        return undefined;
    }
    const value = (body as Record<string, unknown>)[name];
    return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function positiveIntParam(req: Request, name: string): number | undefined {
    const raw = routeParam(req, name);
    if (raw === undefined) {
        return undefined;
    }
    const id = Number(raw);
    if (!Number.isSafeInteger(id) || id <= 0) {
        return undefined;
    }
    return id;
}

export function setCapabilityAuth(res: Response, auth: InternalServiceAuth): void {
    res.locals[INTERNAL_SERVICE_AUTH_LOCALS_KEY] = auth;
}

/** `:nangoConnectionId`, `:syncId`, and `:taskId` are bound when the route defines them. */
function pathBound(req: Request, auth: InternalServiceAuth): boolean {
    if ('nangoConnectionId' in req.params && !isResourceBound(auth, 'connectionId', positiveIntParam(req, 'nangoConnectionId'))) {
        return false;
    }
    if ('syncId' in req.params && !isResourceBound(auth, 'syncId', routeParam(req, 'syncId'))) {
        return false;
    }
    if ('taskId' in req.params && !isTaskBoundAuth(auth, routeParam(req, 'taskId'))) {
        return false;
    }
    return true;
}

/**
 * Secret-key callers pass through. `null` rejects every task JWT: the route declares no capability.
 * A scope requires that claim and a match on the route's resource params.
 */
export function requireTaskCapability(scope: TaskCapabilityScope | null, opts?: { bodySyncId?: string }) {
    return (req: Request, res: Response, next: NextFunction): void => {
        const auth = getInternalServiceAuth(res);
        if (!auth || auth.kind !== 'jwt') {
            next();
            return;
        }
        if (scope === null || !hasScope(auth, scope) || !pathBound(req, auth)) {
            unauthorized(res, 'unauthorized', 'Unauthorized');
            return;
        }
        if (opts?.bodySyncId !== undefined && !isResourceBound(auth, 'syncId', bodyString(req, opts.bodySyncId))) {
            unauthorized(res, 'unauthorized', 'Unauthorized');
            return;
        }
        next();
    };
}
