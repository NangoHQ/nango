import { INTERNAL_SERVICE_AUTH_LOCALS_KEY, INTERNAL_SERVICE_ISSUER_JOBS, INTERNAL_SERVICE_ISSUER_SERVER, nodeSubject, taskSubject } from './constants.js';
import { keyRegistryFromPublicKeys, mergeKeyRegistries, verify } from './jwt.js';
import { verifyInternalServiceCredential } from './verify.js';

import type { InternalServiceAuth, TaskCapabilityScope } from './constants.js';
import type { InternalAuthEnvs } from './credential.js';
import type { TaskCapabilityResource } from './jwt.js';
import type { InternalAuthPublicKey } from '@nangohq/types';
import type { NextFunction, Request, Response } from 'express';

export function unauthorized(res: Response, code: 'missing_auth_header' | 'malformed_auth_header' | 'unauthorized', message: string): void {
    res.status(401).json({ error: { code, message } });
}

function parseBearer(header: string | undefined): { ok: true; token: string } | { ok: false; code: 'missing_auth_header' | 'malformed_auth_header' } {
    if (!header) {
        return { ok: false, code: 'missing_auth_header' };
    }
    const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
    if (!match || !match[1]) {
        return { ok: false, code: 'malformed_auth_header' };
    }
    return { ok: true, token: match[1] };
}

export function getInternalServiceAuth(res: Response): InternalServiceAuth | undefined {
    return res.locals[INTERNAL_SERVICE_AUTH_LOCALS_KEY] as InternalServiceAuth | undefined;
}

export function isTaskBoundAuth(auth: InternalServiceAuth | undefined, taskId: string | undefined): boolean {
    if (!taskId) {
        return false;
    }
    if (auth?.kind === 'jwt') {
        return auth.issuer === INTERNAL_SERVICE_ISSUER_JOBS && auth.sub === taskSubject(taskId);
    }
    return Boolean(isSignedAuth(auth) && auth?.op === 'task' && auth.taskId === taskId);
}

export function isNodeBoundAuth(auth: InternalServiceAuth | undefined, nodeId: string | undefined): boolean {
    if (!nodeId) {
        return false;
    }
    if (auth?.kind === 'jwt') {
        return auth.issuer === INTERNAL_SERVICE_ISSUER_JOBS && auth.sub === nodeSubject(nodeId);
    }
    return Boolean(isSignedAuth(auth) && auth?.op === 'node' && auth.nodeId === nodeId);
}

function isSignedAuth(auth: InternalServiceAuth | undefined): boolean {
    return auth?.kind === 'hmac' || auth?.kind === 'eddsa';
}

function isJobsTaskJwt(auth: InternalServiceAuth | undefined): auth is InternalServiceAuth {
    return auth?.kind === 'jwt' && auth.issuer === INTERNAL_SERVICE_ISSUER_JOBS && Boolean(auth.sub?.startsWith('task:'));
}

/** A missing param must not match a missing claim. A bad param cannot equal a claim that already parsed as a positive int or non-empty string. */
export function isResourceBound(auth: InternalServiceAuth | undefined, key: keyof TaskCapabilityResource, value: number | string | undefined): boolean {
    if (value === undefined) {
        return false;
    }
    return isJobsTaskJwt(auth) && auth.res?.[key] === value;
}

export function hasScope(auth: InternalServiceAuth | undefined, scope: TaskCapabilityScope): boolean {
    return isJobsTaskJwt(auth) && Boolean(auth.scopes?.includes(scope));
}

export type TaskCapabilityAuth = InternalServiceAuth & { res: TaskCapabilityResource };

let capabilityKeys: readonly InternalAuthPublicKey[] | undefined;
let capabilityRegistry: ReturnType<typeof keyRegistryFromPublicKeys> | undefined;

function capabilityRegistryFor(keys: readonly InternalAuthPublicKey[] | undefined): ReturnType<typeof keyRegistryFromPublicKeys> {
    if (capabilityRegistry && capabilityKeys === keys) {
        return capabilityRegistry;
    }
    capabilityKeys = keys;
    capabilityRegistry = keyRegistryFromPublicKeys(keys, INTERNAL_SERVICE_ISSUER_JOBS);
    return capabilityRegistry;
}

/** Jobs task JWT for `audience`, or `null`. A result always has `res.environmentId`. The registry is built once per `keys` array. */
export async function verifyTaskCapabilityToken(
    token: string,
    audience: string,
    keys: readonly InternalAuthPublicKey[] | undefined
): Promise<TaskCapabilityAuth | null> {
    const { auth } = await verify(token, audience, capabilityRegistryFor(keys));
    if (!auth || !isJobsTaskJwt(auth) || !auth.res) {
        return null;
    }
    return { ...auth, res: auth.res };
}

function registryFromEnvs(envs: InternalAuthEnvs) {
    return mergeKeyRegistries(
        keyRegistryFromPublicKeys(envs.NANGO_INTERNAL_AUTH_JOBS_PUBLIC_KEYS, INTERNAL_SERVICE_ISSUER_JOBS),
        keyRegistryFromPublicKeys(envs.NANGO_INTERNAL_AUTH_SERVER_PUBLIC_KEYS, INTERNAL_SERVICE_ISSUER_SERVER)
    );
}

export function internalServiceAuthMiddleware(opts: {
    audience: string;
    envs: InternalAuthEnvs;
    skip?: (req: Request) => boolean;
}): (req: Request, res: Response, next: NextFunction) => void {
    const registry = registryFromEnvs(opts.envs);
    return (req, res, next) => {
        void authenticate(req, res, next);
    };

    async function authenticate(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            if (opts.skip?.(req) || !opts.envs.NANGO_INTERNAL_AUTH_REQUIRED) {
                next();
                return;
            }

            const parsed = parseBearer(req.get('authorization'));

            if (!parsed.ok) {
                unauthorized(
                    res,
                    parsed.code,
                    parsed.code === 'missing_auth_header' ? 'Missing authorization header' : 'Malformed authorization header. Expected `Bearer <token>`'
                );
                return;
            }

            const auth = await verifyInternalServiceCredential(parsed.token, opts.audience, {
                signingKey: opts.envs.NANGO_INTERNAL_AUTH_SIGNING_KEY,
                staticToken: opts.envs.NANGO_INTERNAL_AUTH_TOKEN,
                runnerPublicKey: opts.envs.NANGO_INTERNAL_AUTH_RUNNER_PUBLIC_KEY,
                registry
            });
            if (!auth) {
                unauthorized(res, 'unauthorized', 'Unauthorized');
                return;
            }
            res.locals[INTERNAL_SERVICE_AUTH_LOCALS_KEY] = auth;
            next();
        } catch (err) {
            next(err);
        }
    }
}

export function routeParam(req: Request, name: string): string | undefined {
    const value = req.params[name];
    return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/** When REQUIRED, the matched route's `:taskId` must equal the signed task JWT. Register on that route. */
export function requireTaskBoundAuth(envs: InternalAuthEnvs): (req: Request, res: Response, next: NextFunction) => void {
    return (req, res, next) => {
        if (!envs.NANGO_INTERNAL_AUTH_REQUIRED) {
            next();
            return;
        }
        const auth = getInternalServiceAuth(res);
        const taskId = routeParam(req, 'taskId');
        if (isTaskBoundAuth(auth, taskId)) {
            next();
            return;
        }
        unauthorized(res, 'unauthorized', 'Unauthorized');
    };
}

/**
 * When REQUIRED and the token carries a `scopes` claim, the route scope must be included.
 * TODO: reject a token with no `scopes` claim. The pass below only covers task tokens minted
 * before this deploy, which live at most 25h. After that window it is fail-open.
 */
export function requireTaskScope(envs: InternalAuthEnvs, scope: TaskCapabilityScope): (req: Request, res: Response, next: NextFunction) => void {
    return (_req, res, next) => {
        if (!envs.NANGO_INTERNAL_AUTH_REQUIRED) {
            next();
            return;
        }
        const auth = getInternalServiceAuth(res);
        // TODO: remove this pass once every in-flight pre-scope token has expired (25h).
        if (!auth?.scopes) {
            next();
            return;
        }
        if (hasScope(auth, scope)) {
            next();
            return;
        }
        unauthorized(res, 'unauthorized', 'Unauthorized');
    };
}

/** When REQUIRED, the matched route's `:nodeId` must equal the signed node JWT. Register on that route. */
export function requireFleetAuth(envs: InternalAuthEnvs): (req: Request, res: Response, next: NextFunction) => void {
    return (req, res, next) => {
        if (!envs.NANGO_INTERNAL_AUTH_REQUIRED) {
            next();
            return;
        }
        const auth = getInternalServiceAuth(res);
        const nodeId = routeParam(req, 'nodeId');
        if (isNodeBoundAuth(auth, nodeId)) {
            next();
            return;
        }
        unauthorized(res, 'unauthorized', 'Unauthorized');
    };
}
