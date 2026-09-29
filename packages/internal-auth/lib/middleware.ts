import { INTERNAL_SERVICE_AUTH_LOCALS_KEY, INTERNAL_SERVICE_ISSUER_JOBS, INTERNAL_SERVICE_ISSUER_SERVER, nodeSubject, taskSubject } from './constants.js';
import { keyRegistryFromPublicKeys, mergeKeyRegistries } from './jwt.js';
import { verifyInternalServiceCredential } from './verify.js';

import type { InternalServiceAuth } from './constants.js';
import type { InternalAuthEnvs } from './credential.js';
import type { NextFunction, Request, Response } from 'express';

function unauthorized(res: Response, code: 'missing_auth_header' | 'malformed_auth_header' | 'unauthorized', message: string): void {
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
        return auth.sub === taskSubject(taskId);
    }
    return Boolean(isSignedAuth(auth) && auth?.op === 'task' && auth.taskId === taskId);
}

export function isNodeBoundAuth(auth: InternalServiceAuth | undefined, nodeId: string | undefined): boolean {
    if (!nodeId) {
        return false;
    }
    if (auth?.kind === 'jwt') {
        return auth.sub === nodeSubject(nodeId);
    }
    return Boolean(isSignedAuth(auth) && auth?.op === 'node' && auth.nodeId === nodeId);
}

function isSignedAuth(auth: InternalServiceAuth | undefined): boolean {
    return auth?.kind === 'hmac' || auth?.kind === 'eddsa';
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
                registry: registryFromEnvs(opts.envs)
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

function routeParam(req: Request, name: string): string | undefined {
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
