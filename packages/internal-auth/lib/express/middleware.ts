import { verifyInternalServiceCredential } from '../authenticate.js';
import { keyRegistryFromPublicKeys, mergeKeyRegistries } from '../core/registry.js';
import { INTERNAL_SERVICE_AUTH_LOCALS_KEY, INTERNAL_SERVICE_ISSUER_JOBS, INTERNAL_SERVICE_ISSUER_SERVER } from '../nango/principals.js';

import type { InternalAuthEnvs } from '../nango/env.js';
import type { InternalServiceAuth } from '../nango/principals.js';
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
