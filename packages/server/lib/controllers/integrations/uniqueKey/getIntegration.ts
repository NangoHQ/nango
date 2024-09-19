import { asyncWrapper } from '../../../utils/asyncWrapper.js';
import { zodErrorToHTTP } from '@nangohq/utils';
import type { ApiPublicIntegrationInclude, GetPublicIntegration } from '@nangohq/types';
import { configService, getGlobalWebhookReceiveUrl, getProvider } from '@nangohq/shared';
import { z } from 'zod';
import { providerConfigKeySchema } from '../../../helpers/validation.js';
import { integrationToPublicApi } from '../../../formatters/integration.js';

export const validationParams = z
    .object({
        uniqueKey: providerConfigKeySchema
    })
    .strict();

const valInclude = z.enum(['webhook']);
const validationQuery = z
    .object({
        include: z
            .union([
                z
                    .string()
                    .transform((v) => [v])
                    .pipe(z.array(valInclude)),
                z.array(valInclude)
            ])
            .optional()
    })
    .strict();

export const getPublicIntegration = asyncWrapper<GetPublicIntegration>(async (req, res) => {
    const valQuery = validationQuery.safeParse(req.query);
    if (!valQuery.success) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(valQuery.error) } });
        return;
    }

    const valParams = validationParams.safeParse(req.params);
    if (!valParams.success) {
        res.status(400).send({ error: { code: 'invalid_uri_params', errors: zodErrorToHTTP(valParams.error) } });
        return;
    }

    const { environment } = res.locals;
    const params: GetPublicIntegration['Params'] = valParams.data;
    const query: GetPublicIntegration['Querystring'] = valQuery.data;

    const queryInclude = new Set(query.include || []);

    const integration = await configService.getProviderConfig(params.uniqueKey, environment.id);
    if (!integration) {
        res.status(404).send({ error: { code: 'not_found', message: `Integration "${params.uniqueKey}" does not exist` } });
        return;
    }

    const provider = getProvider(integration.provider);
    if (!provider) {
        res.status(404).send({ error: { code: 'not_found', message: `Unknown provider ${integration.provider}` } });
        return;
    }

    const include: ApiPublicIntegrationInclude = {};
    if (queryInclude.has('webhook')) {
        include.webhook_url = provider.webhook_routing_script ? `${getGlobalWebhookReceiveUrl()}/${environment.uuid}/${integration.provider}` : null;
    }

    res.status(200).send({
        data: integrationToPublicApi(integration, include)
    });
});
