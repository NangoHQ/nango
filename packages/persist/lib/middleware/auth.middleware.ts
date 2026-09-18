import tracer from 'dd-trace';

import {
    hasAction,
    INTERNAL_SERVICE_AUDIENCE_PERSIST,
    INTERNAL_SERVICE_AUTH_LOCALS_KEY,
    isEnvironmentBoundAuth,
    isJwtShape,
    verifyInternalServiceToken
} from '@nangohq/internal-auth';
import { accountService } from '@nangohq/shared';
import { flagHasPlan, stringifyError, tagTraceUser } from '@nangohq/utils';

import { envs } from '../env.js';
import { persistActionForRequest } from './persist-actions.js';

import type { InternalServiceAuth } from '@nangohq/internal-auth';
import type { PersistAuthContext } from '@nangohq/types';
import type { NextFunction, Request, Response } from 'express';

export type AuthLocals = PersistAuthContext & { [INTERNAL_SERVICE_AUTH_LOCALS_KEY]?: InternalServiceAuth };

export const authMiddleware = async (req: Request, res: Response<any, AuthLocals>, next: NextFunction) => {
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
        if (isJwtShape(secret)) {
            const auth = verifyInternalServiceToken(secret, INTERNAL_SERVICE_AUDIENCE_PERSIST, envs.NANGO_INTERNAL_AUTH_SIGNING_KEY);
            if (!auth.ok) {
                res.status(401).json({ error: { code: 'unauthorized', message: 'Unauthorized' } });
                return;
            }
            if (!isEnvironmentBoundAuth(auth, environmentId)) {
                res.status(401).json({ error: { code: 'unauthorized', message: 'Unauthorized' } });
                return;
            }
            const action = persistActionForRequest(req);
            if (!action || !hasAction(auth, action)) {
                res.status(401).json({ error: { code: 'unauthorized', message: 'Unauthorized' } });
                return;
            }
            res.locals[INTERNAL_SERVICE_AUTH_LOCALS_KEY] = auth;

            const result = await tracer.trace('persist.middleware.auth.getPersistAuthContextByEnvironmentId', async (span) => {
                const resolved = await accountService.getPersistAuthContextByEnvironmentId(environmentId);
                if (resolved.isErr()) {
                    span?.setTag('error', resolved.error);
                }
                return resolved;
            });
            if (!applyPersistContext(res, result, environmentId)) {
                return;
            }
            next();
            return;
        }

        const result = await tracer.trace('persist.middleware.auth.getPersistAuthContext', async (span) => {
            const resolved = await accountService.getPersistAuthContext(secret);
            if (resolved.isErr()) {
                // Err is returned, not thrown, so the span must be failed explicitly
                span?.setTag('error', resolved.error);
            }
            return resolved;
        });
        if (!applyPersistContext(res, result, environmentId)) {
            return;
        }
        next();
    } catch (err) {
        res.status(401).json({ error: { code: 'unauthorized', message: `Unauthorized: ${stringifyError(err)}` } });
    }
};

function applyPersistContext(
    res: Response<any, AuthLocals>,
    result: Awaited<ReturnType<typeof accountService.getPersistAuthContext>>,
    environmentId: number
): boolean {
    if (result.isErr()) {
        res.status(401).json({ error: { code: 'unauthorized', message: `Unauthorized: ${stringifyError(result.error)}` } });
        return false;
    }
    const accountContext = result.value;
    if (!accountContext) {
        res.status(401).json({ error: { code: 'unauthorized', message: `Unauthorized: Account not found` } });
        return false;
    }
    if (accountContext.environment.id !== environmentId) {
        res.status(401).json({ error: { code: 'unauthorized', message: `Unauthorized: Matching environment not found` } });
        return false;
    }
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
