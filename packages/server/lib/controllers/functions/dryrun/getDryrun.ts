import { getFunctionDryrun as getStoredFunctionDryrun } from '@nangohq/sandbox';
import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { asyncWrapper } from '../../../utils/asyncWrapper.js';
import { functionDryrunParamsSchema } from '../validation.js';

import type { GetFunctionDryrun } from '@nangohq/types';

export const getFunctionDryrun = asyncWrapper<GetFunctionDryrun>(async (req, res) => {
    const emptyQuery = requireEmptyQuery(req);
    if (emptyQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
        return;
    }

    const valParams = functionDryrunParamsSchema.safeParse(req.params);
    if (!valParams.success) {
        res.status(400).send({ error: { code: 'invalid_uri_params', errors: zodErrorToHTTP(valParams.error) } });
        return;
    }

    const { environment } = res.locals;
    const dryrun = await getStoredFunctionDryrun({ environmentId: environment.id, id: valParams.data.id });
    if (!dryrun) {
        res.status(404).send({ error: { code: 'dryrun_not_found', message: `Dryrun '${valParams.data.id}' was not found` } });
        return;
    }

    res.status(200).send(dryrun);
});
