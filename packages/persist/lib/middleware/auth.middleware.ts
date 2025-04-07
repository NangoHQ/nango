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
        res.status(401).json({ error: 'Missing authorization header' });
        return;
    }

    const secret = authorizationHeader.split('Bearer ').pop();
    if (!secret) {
        res.status(401).json({ error: 'Malformed authorization header. Expected `Bearer SECRET_KEY`' });
        return;
    }

    const environmentId = parseInt(req.params['environmentId'] || '');
    if (!environmentId) {
        res.status(401).json({ error: 'Missing environmentId' });
        return;
    }

    try {
        const accountAndEnv = await environmentService.getAccountAndEnvironmentBySecretKey(secret);
        if (!accountAndEnv || accountAndEnv.environment.id !== environmentId) {
            throw new Error('Cannot find matching environment');
        }

        let plan: DBPlan | null = null;
        if (flagHasPlan) {
            const resPlan = await getPlan(db.knex, { accountId: accountAndEnv.account.id });
            if (resPlan.isErr()) {
                res.status(401).json({ error: `Unauthorized: ${stringifyError(resPlan.error)}` });
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
        res.status(401).json({ error: `Unauthorized: ${stringifyError(err)}` });
    }
};
