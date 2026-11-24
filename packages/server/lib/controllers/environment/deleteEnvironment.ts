import * as z from 'zod';

import { environmentService, PROD_ENVIRONMENT_NAME } from '@nangohq/shared';
import { report, requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { startEnvironmentDeletion } from '../../tasks/startEnvironmentDeletion.js';
import { asyncWrapper } from '../../utils/asyncWrapper.js';

import type { DeletePublicEnvironment } from '@nangohq/types';

const validationParams = z.object({ environmentUuid: z.uuid() }).strict();

export const deletePublicEnvironment = asyncWrapper<DeletePublicEnvironment>(async (req, res) => {
    const emptyQuery = requireEmptyQuery(req);
    if (emptyQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
        return;
    }

    const valParams = validationParams.safeParse(req.params);
    if (!valParams.success) {
        res.status(400).send({ error: { code: 'invalid_uri_params', errors: zodErrorToHTTP(valParams.error) } });
        return;
    }

    const account = res.locals.account;
    if (!account) {
        res.status(500).send({ error: { code: 'server_error', message: 'Account context is required' } });
        return;
    }

    const params: DeletePublicEnvironment['Params'] = valParams.data;
    const environment = await environmentService.getByUuidWithoutSecrets(params.environmentUuid, account.id);
    if (!environment) {
        res.status(404).send({ error: { code: 'not_found', message: 'Environment not found' } });
        return;
    }

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
