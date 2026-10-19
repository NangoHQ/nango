import {
    getInternalServiceAuth,
    hasScope,
    INTERNAL_SERVICE_AUTH_LOCALS_KEY,
    isConnectionBoundAuth,
    isSyncBoundAuth,
    isTaskBoundAuth
} from '@nangohq/internal-auth';

import type { InternalServiceAuth } from '@nangohq/internal-auth';
import type { NextFunction, Request, Response } from 'express';

const CONNECTION_PARAM = 'nangoConnectionId';
const SYNC_PARAM = 'syncId';
const TASK_PARAM = 'taskId';

function unauthorized(res: Response): void {
    res.status(401).json({ error: { code: 'unauthorized', message: 'Unauthorized' } });
}

function pathHasParam(path: string, name: string): boolean {
    return path.split('/').includes(`:${name}`);
}

function stringParam(req: Request, name: string): string | undefined {
    const value = req.params[name];
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

/**
 * Secret-key callers pass through. A task JWT must match the scope. Resource ids are the path
 * params Express already matched (`:nangoConnectionId`, `:syncId`, `:taskId`).
 */
export function requireTaskCapability(scope: string, path: string) {
    const connection = pathHasParam(path, CONNECTION_PARAM);
    const sync = pathHasParam(path, SYNC_PARAM);
    const task = pathHasParam(path, TASK_PARAM);
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
        if (connection && !isConnectionBoundAuth(auth, positiveIntParam(req, CONNECTION_PARAM))) {
            unauthorized(res);
            return;
        }
        if (sync && !isSyncBoundAuth(auth, stringParam(req, SYNC_PARAM))) {
            unauthorized(res);
            return;
        }
        if (task && !isTaskBoundAuth(auth, stringParam(req, TASK_PARAM))) {
            unauthorized(res);
            return;
        }
        next();
    };
}
