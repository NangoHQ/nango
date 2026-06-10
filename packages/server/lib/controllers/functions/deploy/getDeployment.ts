import { getFunctionDeployment as getStoredFunctionDeployment } from '@nangohq/sandbox';
import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { asyncWrapper } from '../../../utils/asyncWrapper.js';
import { functionDeploymentParamsSchema } from '../validation.js';

import type { GetFunctionDeployment } from '@nangohq/types';

export const getFunctionDeployment = asyncWrapper<GetFunctionDeployment>(async (req, res) => {
    const emptyQuery = requireEmptyQuery(req);
    if (emptyQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
        return;
    }

    const valParams = functionDeploymentParamsSchema.safeParse(req.params);
    if (!valParams.success) {
        res.status(400).send({ error: { code: 'invalid_uri_params', errors: zodErrorToHTTP(valParams.error) } });
        return;
    }

    const { environment } = res.locals;
    const deployment = await getStoredFunctionDeployment({ environmentId: environment.id, id: valParams.data.id });
    if (!deployment) {
        res.status(404).send({ error: { code: 'deployment_not_found', message: `Deployment '${valParams.data.id}' was not found` } });
        return;
    }

    res.status(200).send(deployment);
});
