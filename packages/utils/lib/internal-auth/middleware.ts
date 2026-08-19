import { getLogger } from '../logger.js';
import { INTERNAL_SERVICE_AUTH_LOCALS_KEY } from './constants.js';
import { isInternalAuthRequired } from './credential.js';
import { verifyInternalServiceCredential } from './verify.js';

import type { InternalServiceAuth } from './constants.js';
import type { NextFunction, Request, Response } from 'express';

const logger = getLogger('internalAuth');

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

export function internalServiceAuthMiddleware(opts: { audience: string }): (req: Request, res: Response, next: NextFunction) => void {
    return (req, res, next) => {
        const required = isInternalAuthRequired();
        const parsed = parseBearer(req.get('authorization'));

        if (!parsed.ok) {
            if (required) {
                unauthorized(
                    res,
                    parsed.code,
                    parsed.code === 'missing_auth_header' ? 'Missing authorization header' : 'Malformed authorization header. Expected `Bearer <token>`'
                );
                return;
            }
            next();
            return;
        }

        void verifyInternalServiceCredential(parsed.token, opts.audience)
            .then((auth) => {
                if (!auth) {
                    if (required) {
                        unauthorized(res, 'unauthorized', 'Unauthorized');
                        return;
                    }
                    logger.warning('Ignoring invalid internal service credential because NANGO_INTERNAL_AUTH_REQUIRED is false');
                    next();
                    return;
                }
                res.locals[INTERNAL_SERVICE_AUTH_LOCALS_KEY] = auth;
                next();
            })
            .catch((err: unknown) => {
                logger.warning('Internal service auth verification failed', { error: err });
                if (required) {
                    unauthorized(res, 'unauthorized', 'Unauthorized');
                    return;
                }
                next();
            });
    };
}

function taskIdFromRequest(req: Request): string | undefined {
    const fromParams = req.params['taskId'];
    if (typeof fromParams === 'string' && fromParams.length > 0) {
        return fromParams;
    }
    // `app.use('/tasks', mw)` strips the prefix from `req.path`; combine with baseUrl.
    const path = `${req.baseUrl || ''}${req.path}`;
    const match = /\/tasks\/([^/]+)/.exec(path);
    return match?.[1];
}

/** When REQUIRED, putTask/heartbeat must present a matching HMAC task JWT. */
export function requireTaskBoundAuth(req: Request, res: Response, next: NextFunction): void {
    if (!isInternalAuthRequired()) {
        next();
        return;
    }
    const auth = getInternalServiceAuth(res);
    const taskId = taskIdFromRequest(req);
    if (auth?.kind === 'hmac' && taskId && auth.taskId === taskId) {
        next();
        return;
    }
    unauthorized(res, 'unauthorized', 'Unauthorized');
}

/** When REQUIRED, register/idle must present a static bearer or Kubernetes SA token. */
export function requireFleetAuth(_req: Request, res: Response, next: NextFunction): void {
    if (!isInternalAuthRequired()) {
        next();
        return;
    }
    const auth = getInternalServiceAuth(res);
    if (auth?.kind === 'static' || auth?.kind === 'kubernetes') {
        next();
        return;
    }
    unauthorized(res, 'unauthorized', 'Unauthorized');
}
