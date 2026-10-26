import { INTERNAL_SERVICE_ISSUER_JOBS } from '../nango/principals.js';
import { getInternalServiceAuth } from './middleware.js';

import type { InternalAuthEnvs } from '../nango/env.js';
import type { InternalServiceAuth, TaskCapabilityResource } from '../nango/principals.js';
import type { TaskCapabilityScope } from '../nango/scopes.js';
import type { NextFunction, Request, Response } from 'express';

export type BindingKey = 'taskId' | 'nodeId' | 'environmentId' | 'connectionId' | 'syncId';

function unauthorized(res: Response): void {
    res.status(401).json({ error: { code: 'unauthorized', message: 'Unauthorized' } });
}

function routeParam(req: Request, name: string): string | undefined {
    const value = req.params[name];
    return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/**
 * One map for every token format. JWT subjects `task:<id>` and `node:<id>` and the HMAC/EdDSA
 * `taskId` / `nodeId` claims land on the same keys. Resource fields are copied from a capability `res`.
 */
export function bindingsFrom(auth: InternalServiceAuth | undefined): Partial<Record<BindingKey, string | number>> {
    if (!auth) {
        return {};
    }
    const bindings: Partial<Record<BindingKey, string | number>> = {};
    if (auth.kind === 'jwt' && auth.issuer === INTERNAL_SERVICE_ISSUER_JOBS && auth.sub) {
        if (auth.sub.startsWith('task:') && auth.sub.length > 'task:'.length) {
            bindings.taskId = auth.sub.slice('task:'.length);
            if (auth.res) {
                bindings.environmentId = auth.res.environmentId;
                bindings.connectionId = auth.res.connectionId;
                if (auth.res.syncId !== undefined) {
                    bindings.syncId = auth.res.syncId;
                }
            }
        } else if (auth.sub.startsWith('node:') && auth.sub.length > 'node:'.length) {
            bindings.nodeId = auth.sub.slice('node:'.length);
        }
    } else if ((auth.kind === 'hmac' || auth.kind === 'eddsa') && auth.op === 'task' && auth.taskId) {
        bindings.taskId = auth.taskId;
    } else if ((auth.kind === 'hmac' || auth.kind === 'eddsa') && auth.op === 'node' && auth.nodeId) {
        bindings.nodeId = auth.nodeId;
    }
    return bindings;
}

function isTaskCredential(auth: InternalServiceAuth | undefined): boolean {
    if (!auth) {
        return false;
    }
    if ((auth.kind === 'hmac' || auth.kind === 'eddsa') && auth.op === 'task' && Boolean(auth.taskId)) {
        return true;
    }
    return isJobsTaskJwt(auth);
}

/**
 * The request value must equal the binding. A missing binding is 401, except `{ allowAbsent: true }`
 * on a task credential that has no `res` (HMAC, legacy EdDSA, and scope-less task JWTs) until that
 * fallback is removed. A request with no credential still fails.
 */
export function requireBinding(
    envs: InternalAuthEnvs,
    key: BindingKey,
    read: (req: Request) => string | number | undefined,
    opts?: { allowAbsent?: boolean }
): (req: Request, res: Response, next: NextFunction) => void {
    return (req, res, next) => {
        if (!envs.NANGO_INTERNAL_AUTH_REQUIRED) {
            next();
            return;
        }
        const auth = getInternalServiceAuth(res);
        const expected = bindingsFrom(auth)[key];
        if (expected === undefined) {
            if (opts?.allowAbsent && isTaskCredential(auth)) {
                next();
                return;
            }
            unauthorized(res);
            return;
        }
        const actual = read(req);
        if (actual === undefined || actual === '' || String(expected) !== String(actual)) {
            unauthorized(res);
            return;
        }
        next();
    };
}

export function isTaskBoundAuth(auth: InternalServiceAuth | undefined, taskId: string | undefined): boolean {
    if (!taskId) {
        return false;
    }
    return bindingsFrom(auth).taskId === taskId;
}

export function isNodeBoundAuth(auth: InternalServiceAuth | undefined, nodeId: string | undefined): boolean {
    if (!nodeId) {
        return false;
    }
    return bindingsFrom(auth).nodeId === nodeId;
}

/** When REQUIRED, the matched route's `:taskId` must equal the signed task. */
export function requireTaskBoundAuth(envs: InternalAuthEnvs): (req: Request, res: Response, next: NextFunction) => void {
    return requireBinding(envs, 'taskId', (req) => routeParam(req, 'taskId'));
}

/** When REQUIRED, the matched route's `:nodeId` must equal the signed node. */
export function requireFleetAuth(envs: InternalAuthEnvs): (req: Request, res: Response, next: NextFunction) => void {
    return requireBinding(envs, 'nodeId', (req) => routeParam(req, 'nodeId'));
}

function isJobsTaskJwt(auth: InternalServiceAuth | undefined): auth is InternalServiceAuth {
    return Boolean(
        auth?.kind === 'jwt' &&
            auth.issuer === INTERNAL_SERVICE_ISSUER_JOBS &&
            typeof auth.sub === 'string' &&
            auth.sub.startsWith('task:') &&
            auth.sub.length > 'task:'.length
    );
}

export function hasScope(auth: InternalServiceAuth | undefined, scope: TaskCapabilityScope): boolean {
    return isJobsTaskJwt(auth) && auth.res !== undefined && Boolean(auth.scopes?.includes(scope));
}

export function isResourceBound(auth: InternalServiceAuth | undefined, key: keyof TaskCapabilityResource, value: number | string | undefined): boolean {
    if (value === undefined || !isJobsTaskJwt(auth) || !auth.res) {
        return false;
    }
    return auth.res[key] === value;
}

/**
 * When REQUIRED, the route's declared scope must be on the task capability token.
 * HMAC and legacy EdDSA task tokens carry no scopes and pass. Node tokens and the static token do not.
 * A scope-less Ed25519 task JWT also passes until the fallback below is removed.
 */
export function requireScope(envs: InternalAuthEnvs, scope: TaskCapabilityScope): (req: Request, res: Response, next: NextFunction) => void {
    return (_req, res, next) => {
        if (!envs.NANGO_INTERNAL_AUTH_REQUIRED) {
            next();
            return;
        }
        const auth = getInternalServiceAuth(res);
        if (auth && (auth.kind === 'hmac' || auth.kind === 'eddsa') && auth.op === 'task' && auth.taskId) {
            next();
            return;
        }
        // TODO(NAN-6636): remove this fallback in PR 5, at least 25h after capability tokens are deployed.
        // It applies only to Ed25519 task JWTs minted before they carried a scopes claim. An explicit empty
        // array is not that legacy token. HMAC and legacy EdDSA task tokens are handled above.
        if (isJobsTaskJwt(auth) && auth.scopes === undefined) {
            next();
            return;
        }
        if (hasScope(auth, scope)) {
            next();
            return;
        }
        unauthorized(res);
    };
}
