import { environmentService } from '@nangohq/shared';
import { requireEmptyBody, requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { asyncWrapper } from '../../utils/asyncWrapper.js';

import type { GetPublicEnvironmentVariables } from '@nangohq/types';

export const getPublicEnvironmentVariables = asyncWrapper<GetPublicEnvironmentVariables>(async (req, res) => {
    const emptyQuery = requireEmptyQuery(req);
    if (emptyQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
        return;
    }

    const emptyBody = requireEmptyBody(req);
    if (emptyBody) {
        res.status(400).send({ error: { code: 'invalid_body', errors: zodErrorToHTTP(emptyBody.error) } });
        return;
    }

    const { environment } = res.locals;
    const environmentVariables = await environmentService.getEnvironmentVariables(environment.id);

    res.status(200).send(
        environmentVariables.map((env) => {
            return {
                name: env.name,
                value: env.value
            };
        })
    );
});
