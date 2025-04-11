import { PROD_ENVIRONMENT_NAME, environmentService } from '@nangohq/shared';
import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { asyncWrapper } from '../../../utils/asyncWrapper.js';
import { getOrchestrator } from '../../../utils/utils.js';

import type { DeleteEnvironment } from '@nangohq/types';

export const deleteEnvironment = asyncWrapper<DeleteEnvironment>(async (req, res) => {
    const emptyQuery = requireEmptyQuery(req, { withEnv: true });
    if (emptyQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
        return;
    }

    const { environment } = res.locals;

    if (environment.name === PROD_ENVIRONMENT_NAME) {
        res.status(400).send({ error: { code: 'cannot_delete_prod_environment', message: 'Cannot delete prod environment' } });
        return;
    }

    await environmentService.softDelete({ environmentId: environment.id, orchestrator: getOrchestrator() });

    res.status(204).send();
});
