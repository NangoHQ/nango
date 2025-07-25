import { connectionCreationStartCapCheck as connectionCreationStartCapCheckHook } from '../hooks/hooks.js';
import { asyncWrapper } from '../utils/asyncWrapper.js';

import type { ApiError, Endpoint } from '@nangohq/types';

export const resourceCapping = asyncWrapper<Endpoint<{ Method: 'POST'; Path: ''; Success: any; Error: ApiError<'resource_capped'> }>>(async (_, res, next) => {
    const { plan, account } = res.locals;

    if (plan) {
        const isCapped = await connectionCreationStartCapCheckHook({
            creationType: 'create',
            team: account,
            plan
        });
        if (isCapped.capped) {
            res.status(400).send({
                error: {
                    code: 'resource_capped',
                    message: 'Reached maximum number of allowed connections. Upgrade your plan to get rid of connection limits.'
                }
            });
            return;
        }
    }

    next();
});
