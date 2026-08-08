import { prepareDeploymentBundle } from '@nangohq/shared';
import { report, requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { asyncWrapperWithEnvironment } from '../../../../utils/asyncWrapper.js';
import { toErrorResponse, toResponse } from './format.js';
import { validation } from './validation.js';

import type { PostFunctionDeploymentBundlePreview } from '@nangohq/types';

export const postFunctionDeploymentBundlePreview = asyncWrapperWithEnvironment<PostFunctionDeploymentBundlePreview>(async (req, res) => {
    const emptyQuery = requireEmptyQuery(req);
    if (emptyQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
        return;
    }

    const val = validation.safeParse(req.body);
    if (!val.success) {
        res.status(400).send({ error: { code: 'invalid_body', errors: zodErrorToHTTP(val.error) } });
        return;
    }

    const { environment } = res.locals;
    const prepared = await prepareDeploymentBundle({
        environmentId: environment.id,
        reconciliationScope: val.data.reconciliationScope,
        functions: val.data.functions
    });
    if (prepared.isErr()) {
        report(prepared.error, { environmentId: environment.id });
        const response = toErrorResponse(prepared.error);
        res.status(response.status).send(response.error);
        return;
    }

    res.send(toResponse(prepared.value));
});
