import { PROD_ENVIRONMENT_NAME } from '@nangohq/shared';
import { report, requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { startEnvironmentDeletion } from '../../../tasks/startEnvironmentDeletion.js';
import { asyncWrapperWithEnvironment } from '../../../utils/asyncWrapper.js';

import type { DeleteEnvironment } from '@nangohq/types';

export const deleteEnvironment = asyncWrapperWithEnvironment<DeleteEnvironment>(async (req, res) => {
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

    const enqueued = await startEnvironmentDeletion({ environmentId: environment.id });
    if (enqueued.isErr()) {
        report(enqueued.error);
        res.status(500).send({ error: { code: 'server_error', message: 'Failed to enqueue environment deletion' } });
        return;
    }

    res.status(204).send();
});
