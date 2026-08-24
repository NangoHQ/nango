import { INTERNAL_SERVICE_AUTH_LOCALS_KEY } from './constants.js';
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

export function internalServiceAuthMiddleware(opts: { audience: string; envs: InternalAuthEnvs }): (req: Request, res: Response, next: NextFunction) => void {
    return (req, res, next) => {
        if (!opts.envs.NANGO_INTERNAL_AUTH_REQUIRED) {
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

        const auth = verifyInternalServiceCredential(parsed.token, opts.audience, {
            signingKey: opts.envs.NANGO_INTERNAL_AUTH_SIGNING_KEY,
            staticToken: opts.envs.NANGO_INTERNAL_AUTH_TOKEN
        });
        if (!auth) {
            unauthorized(res, 'unauthorized', 'Unauthorized');
            return;
        }
        res.locals[INTERNAL_SERVICE_AUTH_LOCALS_KEY] = auth;
        next();
    };
}

function taskIdFromRequest(req: Request): string | undefined {
    const fromParams = req.params['taskId'];
    if (typeof fromParams === 'string' && fromParams.length > 0) {
        return fromParams;
    }
    // `app.use('/tasks', mw)` strips the prefix from `req.path`; combine with baseUrl.
    const path = `${req.baseUrl || ''}${req.path}`;
    const match = /^\/tasks\/([^/]+)(?:\/|$)/.exec(path);
    return match?.[1];
}

function fleetOpFromRequest(req: Request): { nodeId: string; op: 'register' | 'idle' } | undefined {
    const path = `${req.baseUrl || ''}${req.path}`;
    const match = /^\/runners\/([^/]+)\/(register|idle)(?:\/|$)/.exec(path);
    if (!match?.[1] || (match[2] !== 'register' && match[2] !== 'idle')) {
        return undefined;
    }
    return { nodeId: match[1], op: match[2] };
}

/** When REQUIRED, putTask/heartbeat must present a matching HMAC task JWT. */
export function requireTaskBoundAuth(envs: InternalAuthEnvs): (req: Request, res: Response, next: NextFunction) => void {
    return (req, res, next) => {
        if (!envs.NANGO_INTERNAL_AUTH_REQUIRED) {
            next();
            return;
        }
        const auth = getInternalServiceAuth(res);
        const taskId = taskIdFromRequest(req);
        if (auth?.kind === 'hmac' && auth.op === 'task' && taskId && auth.taskId === taskId) {
            next();
            return;
        }
        unauthorized(res, 'unauthorized', 'Unauthorized');
    };
}

/** When REQUIRED, register/idle must present a matching HMAC node JWT. */
export function requireFleetAuth(envs: InternalAuthEnvs): (req: Request, res: Response, next: NextFunction) => void {
    return (req, res, next) => {
        if (!envs.NANGO_INTERNAL_AUTH_REQUIRED) {
            next();
            return;
        }
        const auth = getInternalServiceAuth(res);
        const fleet = fleetOpFromRequest(req);
        if (auth?.kind === 'hmac' && fleet && auth.nodeId === fleet.nodeId && auth.op === fleet.op) {
            next();
            return;
        }
        unauthorized(res, 'unauthorized', 'Unauthorized');
    };
}
