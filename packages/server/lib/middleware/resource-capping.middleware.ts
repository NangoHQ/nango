import { connectionCreationStartCapCheck as connectionCreationStartCapCheckHook } from '../hooks/hooks.js';
import { asyncWrapper } from '../utils/asyncWrapper.js';

import type { ApiError, Endpoint } from '@nangohq/types';

export const resourceCapping = asyncWrapper<Endpoint<{ Method: 'POST'; Path: ''; Success: any; Error: ApiError<'resource_capped'> }>>(
    async (req, res, next) => {
        const { environment, plan, account } = res.locals;

        if (plan) {
            const isCapped = await connectionCreationStartCapCheckHook({
                providerConfigKey: req.params['providerConfigKey'],
                environmentId: environment.id,
                creationType: 'create',
                team: account,
                plan
            });
            if (isCapped.capped) {
                res.status(400).send({
                    error: {
                        code: 'resource_capped',
                        message:
                            isCapped.code === 'max'
                                ? 'Reached maximum number of allowed connections for your plan'
                                : 'Reached maximum number of connections with scripts enabled'
                    }
                });
                return;
            }
        }

        next();
    }
);
