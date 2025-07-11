import tracer from 'dd-trace';

import db from '@nangohq/database';
import { environmentService, getPlan } from '@nangohq/shared';
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
        const accountAndEnv = await tracer.trace('persist.middleware.auth.getAccountAndEnvironmentBySecretKey', async () => {
            return await environmentService.getAccountAndEnvironmentBySecretKey(secret);
        });
        if (!accountAndEnv || accountAndEnv.environment.id !== environmentId) {
            throw new Error('Cannot find matching environment');
        }

        let plan: DBPlan | null = null;
        if (flagHasPlan) {
            const resPlan = await tracer.trace('persist.middleware.auth.getPlan', async () => {
                return await getPlan(db.knex, { accountId: accountAndEnv.account.id });
            });
            if (resPlan.isErr()) {
                res.status(401).json({ error: { code: 'unauthorized', message: `Unauthorized: ${stringifyError(resPlan.error)}` } });
                return;
            }
            plan = resPlan.value;
        }

        res.locals['account'] = accountAndEnv.account;
        res.locals['environment'] = accountAndEnv.environment;
        res.locals['plan'] = plan;
        tagTraceUser({ ...accountAndEnv, plan });
        next();
    } catch (err) {
        res.status(401).json({ error: { code: 'unauthorized', message: `Unauthorized: ${stringifyError(err)}` } });
    }
};
