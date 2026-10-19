import tracer from 'dd-trace';

import {
    INTERNAL_SERVICE_AUDIENCE_PERSIST,
    INTERNAL_SERVICE_ISSUER_JOBS,
    isEnvironmentBoundAuth,
    isJwtShape,
    keyRegistryFromPublicKeys,
    verify
} from '@nangohq/internal-auth';
import { accountService } from '@nangohq/shared';
import { flagHasPlan, stringifyError, tagTraceUser } from '@nangohq/utils';

import { envs } from '../env.js';
import { setCapabilityAuth } from './capability.js';

import type { PersistAuthContext } from '@nangohq/types';
import type { NextFunction, Request, Response } from 'express';

export type AuthLocals = PersistAuthContext;

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

    if (isJwtShape(secret)) {
        await authenticateCapability(res, next, secret, environmentId);
        return;
    }

    try {
        const result = await tracer.trace('persist.middleware.auth.getPersistAuthContext', async (span) => {
            const res = await accountService.getPersistAuthContext(secret);
            if (res.isErr()) {
                // Err is returned, not thrown, so the span must be failed explicitly
                span?.setTag('error', res.error);
            }
            return res;
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
        if (flagHasPlan && !accountContext.plan) {
            res.status(401).json({ error: { code: 'unauthorized', message: `Unauthorized: plan not found` } });
            return;
        }

        applyPersistContext(res, accountContext);
        next();
    } catch (err) {
        res.status(401).json({ error: { code: 'unauthorized', message: `Unauthorized: ${stringifyError(err)}` } });
    }
};

function applyPersistContext(res: Response<any, AuthLocals>, accountContext: PersistAuthContext): void {
    res.locals['account'] = accountContext.account;
    res.locals['environment'] = accountContext.environment;
    res.locals['plan'] = accountContext.plan;
    tagTraceUser({ ...accountContext });
}

async function authenticateCapability(res: Response<any, AuthLocals>, next: NextFunction, token: string, environmentId: number): Promise<void> {
    try {
        const registry = keyRegistryFromPublicKeys(envs.NANGO_INTERNAL_AUTH_JOBS_PUBLIC_KEYS, INTERNAL_SERVICE_ISSUER_JOBS);
        const verified = await verify(token, INTERNAL_SERVICE_AUDIENCE_PERSIST, registry);
        const auth = verified.auth;
        if (!auth || !isEnvironmentBoundAuth(auth, environmentId)) {
            res.status(401).json({ error: { code: 'unauthorized', message: 'Unauthorized' } });
            return;
        }

        const result = await accountService.getPersistAuthContextByEnvironmentId(environmentId);
        if (result.isErr()) {
            res.status(401).json({ error: { code: 'unauthorized', message: `Unauthorized: ${stringifyError(result.error)}` } });
            return;
        }
        const accountContext = result.value;
        if (!accountContext || accountContext.environment.id !== environmentId) {
            res.status(401).json({ error: { code: 'unauthorized', message: 'Unauthorized: Account not found' } });
            return;
        }
        if (flagHasPlan && !accountContext.plan) {
            res.status(401).json({ error: { code: 'unauthorized', message: 'Unauthorized: plan not found' } });
            return;
        }

        setCapabilityAuth(res, auth);
        applyPersistContext(res, accountContext);
        next();
    } catch (err) {
        res.status(401).json({ error: { code: 'unauthorized', message: `Unauthorized: ${stringifyError(err)}` } });
    }
}
