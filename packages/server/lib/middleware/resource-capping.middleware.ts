import { connectionCreationStartCapCheck as connectionCreationStartCapCheckHook } from '../hooks/hooks.js';
import { asyncWrapper } from '../utils/asyncWrapper.js';

import type { ApiError, Endpoint } from '@nangohq/types';

export const resourceCapping = asyncWrapper<Endpoint<{ Method: 'POST'; Path: ''; Success: any; Error: ApiError<'resource_capped'> }>>(
    async (req, res, next) => {
        const { environment, plan, account } = res.locals;

        const { providerConfigKey } = req.params;

        if (plan && providerConfigKey) {
            const isCapped = await connectionCreationStartCapCheckHook({
                providerConfigKey,
                environmentId: environment.id,
                creationType: 'create',
                team: account,
                plan
            });
            if (isCapped) {
                res.status(400).send({ error: { code: 'resource_capped', message: 'Reached maximum number of connections with scripts enabled' } });
                return;
            }
        }

        next();
    }
);
