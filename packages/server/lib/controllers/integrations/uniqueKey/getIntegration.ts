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

const valInclude = z.enum(['webhook', 'credentials']);
const validationQuery = z
    .object({
        include: z
            .union([valInclude, z.array(valInclude)])
            .transform((val) => (Array.isArray(val) ? val : val ? [val] : []))
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

    const { environment, authType } = res.locals;
    const params: GetPublicIntegration['Params'] = valParams.data;
    const query: GetPublicIntegration['Querystring'] = valQuery.data;

    const queryInclude = new Set(query.include || []);
    if (queryInclude.size > 0 && authType !== 'secretKey') {
        // This endpoint is not reachable any other way right now BUT it's to prevent any future mistakes
        res.status(403).send({ error: { code: 'invalid_permissions', message: "Can't include credentials without a private key" } });
        return;
    }

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
    if (queryInclude.has('credentials')) {
        if (provider.auth_mode === 'OAUTH1' || provider.auth_mode === 'OAUTH2' || provider.auth_mode === 'TBA') {
            include.credentials = {
                type: provider.auth_mode,
                client_id: integration.oauth_client_id,
                client_secret: integration.oauth_client_secret,
                scopes: integration.oauth_scopes || null
            };
        } else if (provider.auth_mode === 'APP') {
            include.credentials = {
                type: provider.auth_mode,
                app_id: integration.oauth_client_id,
                private_key: integration.oauth_client_secret,
                app_link: integration.app_link || null
            };
        } else {
            include.credentials = null;
        }
    }

    res.status(200).send({
        data: integrationToPublicApi({ integration, include, provider })
    });
});
