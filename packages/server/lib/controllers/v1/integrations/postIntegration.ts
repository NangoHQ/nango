import { getProvider } from '@nangohq/shared';
import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { integrationToApi } from '../../../formatters/integration.js';
import { trackIntegrationCreate } from '../../../services/integration.service.js';
import { createIntegration } from '../../../services/integrationCreate.service.js';
import { asyncWrapperWithEnvironment } from '../../../utils/asyncWrapper.js';
import { postIntegrationBodySchema } from './validation.js';

import type { PostIntegration } from '@nangohq/types';

export const postIntegration = asyncWrapperWithEnvironment<PostIntegration>(async (req, res) => {
    const emptyQuery = requireEmptyQuery(req, { withEnv: true });
    if (emptyQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
        return;
    }

    const valBody = postIntegrationBodySchema.safeParse(req.body);
    if (!valBody.success) {
        res.status(400).send({
            error: { code: 'invalid_body', errors: zodErrorToHTTP(valBody.error) }
        });
        return;
    }

    const body: PostIntegration['Body'] = valBody.data;
    const provider = getProvider(body.provider);
    if (!provider) {
        res.status(400).send({
            error: { code: 'invalid_body', message: 'invalid provider' }
        });
        return;
    }

    const { environment, account } = res.locals;

    const created = await createIntegration({ body, provider, environment, account });
    if (created.isErr()) {
        if (created.error.code === 'server_error') {
            res.status(500).send({ error: { code: 'server_error', message: created.error.message } });
        } else {
            res.status(400).send({ error: { code: 'invalid_body', message: created.error.message } });
        }
        return;
    }

    trackIntegrationCreate(created.value, 'dashboard');
    res.status(200).send({
        data: integrationToApi(created.value)
    });
});
