import tracer from 'dd-trace';

import { accountService } from '@nangohq/shared';
import { flagHasPlan, stringifyError, tagTraceUser } from '@nangohq/utils';

import type { DBEnvironment, DBPlan, DBTeam } from '@nangohq/types';
import type { NextFunction, Request, Response } from 'express';

export interface AuthLocals {
    account: DBTeam;
    environment: DBEnvironment;
    plan: DBPlan | null;
}

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
        const accountContext = await tracer.trace('persist.middleware.auth.getAccountAndEnvironmentBySecretKey', async () => {
            return await accountService.getAccountContextBySecretKey(secret);
        });
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

        res.locals['account'] = accountContext.account;
        res.locals['environment'] = accountContext.environment;
        res.locals['plan'] = accountContext.plan;
        tagTraceUser({ ...accountContext });
        next();
    } catch (err) {
        res.status(401).json({ error: { code: 'unauthorized', message: `Unauthorized: ${stringifyError(err)}` } });
    }
};
