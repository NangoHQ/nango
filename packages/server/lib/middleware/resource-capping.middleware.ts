import type { Request, Response, NextFunction } from 'express';
import { errorManager } from '@nangohq/shared';
import { connectionCreationStartCapCheck as connectionCreationStartCapCheckHook } from '../hooks/hooks.js';

export const authCheck = async (req: Request, res: Response, next: NextFunction) => {
    const environmentId = res.locals['environment']!.id;
    const account = res.locals['account']!.id;

    const { providerConfigKey } = req.params;

    if (account.is_capped && providerConfigKey) {
        const isCapped = await connectionCreationStartCapCheckHook({ providerConfigKey, environmentId, creationType: 'create' });
        if (isCapped) {
            errorManager.errRes(res, 'resource_capped');
            return;
        }
    }

    next();
};
