import { z } from 'zod';
import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';
import { asyncWrapper } from '../../../utils/asyncWrapper.js';
import type { PostIntegration } from '@nangohq/types';
import { AnalyticsTypes, analytics, configService, getProvider } from '@nangohq/shared';
import { integrationToApi } from '../../../formatters/integration.js';
import { providerSchema } from '../../../helpers/validation.js';

const validationBody = z
    .object({
        provider: providerSchema
    })
    .strict();

export const postIntegration = asyncWrapper<PostIntegration>(async (req, res) => {
    const emptyQuery = requireEmptyQuery(req, { withEnv: true });
    if (emptyQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
        return;
    }

    const valBody = validationBody.safeParse(req.body);
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

    const integration = await configService.createEmptyProviderConfig(body.provider, environment.id, provider);

    void analytics.track(AnalyticsTypes.CONFIG_CREATED, account.id, { provider: body.provider });

    res.status(200).send({
        data: integrationToApi(integration)
    });
});
