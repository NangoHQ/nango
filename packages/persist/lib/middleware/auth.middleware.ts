import tracer from 'dd-trace';

import { jwtHeaderAlg } from '@nangohq/internal-auth';
import { accountService } from '@nangohq/shared';
import { flagHasPlan, stringifyError, tagTraceUser } from '@nangohq/utils';

import type { PersistAuthContext } from '@nangohq/types';
import type { NextFunction, Request, Response } from 'express';

export type AuthLocals = PersistAuthContext;

export function applyPersistAuthContext(res: Response<any, AuthLocals>, accountContext: PersistAuthContext): boolean {
    if (flagHasPlan && !accountContext.plan) {
        res.status(401).json({ error: { code: 'unauthorized', message: `Unauthorized: plan not found` } });
        return false;
    }

    res.locals['account'] = accountContext.account;
    res.locals['environment'] = accountContext.environment;
    res.locals['plan'] = accountContext.plan;
    tagTraceUser({ ...accountContext });
    return true;
}

/**
 * The token from an EdDSA `Authorization` header. The scheme match is anchored and
 * case-insensitive (`Bearer`, `bearer`). Anything else returns undefined so the secret path can run.
 */
export function eddsaBearerToken(header: string | undefined): string | undefined {
    if (!header) {
        return undefined;
    }
    const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
    const token = match?.[1];
    if (!token || jwtHeaderAlg(token) !== 'EdDSA') {
        return undefined;
    }
    return token;
}

/**
 * Secret-key authentication for a route that declared a scope.
 */
export async function authenticateSecret(req: Request, res: Response<any, AuthLocals>, next: NextFunction) {
    const authorizationHeader = req.get('authorization');

    if (!authorizationHeader) {
        res.status(401).json({ error: { code: 'missing_auth_header', message: 'Missing authorization header' } });
        return;
    }

    const secret = authorizationHeader.split('Bearer ').pop();
    if (!secret) {
        res.status(401).json({ error: { code: 'malformed_auth_header', message: 'Malformed authorization header. Expected `Bearer SECRET_KEY`' } });
        return;
    }

    const environmentId = parseInt(req.params['environmentId'] || '');
    if (!environmentId) {
        res.status(401).json({ error: { code: 'missing_environment', message: 'Missing environmentId' } });
        return;
    }

    try {
        const result = await tracer.trace('persist.middleware.auth.getPersistAuthContext', async (span) => {
            const traced = await accountService.getPersistAuthContext(secret);
            if (traced.isErr()) {
                // Err is returned, not thrown, so the span must be failed explicitly
                span?.setTag('error', traced.error);
            }
            return traced;
        });
        if (result.isErr()) {
            res.status(401).json({ error: { code: 'unauthorized', message: `Unauthorized: ${stringifyError(result.error)}` } });
            return;
        }
        const accountContext = result.value;
        if (!accountContext) {
            res.status(401).json({ error: { code: 'unauthorized', message: `Unauthorized: Account not found` } });
            return;
        }
        if (accountContext.environment.id !== environmentId) {
            res.status(401).json({ error: { code: 'unauthorized', message: `Unauthorized: Matching environment not found` } });
            return;
        }
        if (!applyPersistAuthContext(res, accountContext)) {
            return;
        }
        next();
    } catch (err) {
        res.status(401).json({ error: { code: 'unauthorized', message: `Unauthorized: ${stringifyError(err)}` } });
    }
}
