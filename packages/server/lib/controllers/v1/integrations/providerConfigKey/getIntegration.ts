import crypto from 'node:crypto';
import { asyncWrapper } from '../../../../utils/asyncWrapper.js';
import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';
import type { GetIntegration } from '@nangohq/types';
import { configService, connectionService, getGlobalWebhookReceiveUrl } from '@nangohq/shared';
import { z } from 'zod';
import { integrationToApi } from '../../../../formatters/integration.js';
import { providerConfigKeySchema } from '../../../../helpers/validation.js';

export const validationParams = z
    .object({
        providerConfigKey: providerConfigKeySchema
    })
    .strict();

export const getIntegration = asyncWrapper<GetIntegration>(async (req, res) => {
    const emptyQuery = requireEmptyQuery(req, { withEnv: true });
    if (emptyQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
        return;
    }

    const valParams = validationParams.safeParse(req.params);
    if (!valParams.success) {
        res.status(400).send({
            error: { code: 'invalid_uri_params', errors: zodErrorToHTTP(valParams.error) }
        });
        return;
    }

    const { environment } = res.locals;
    const params: GetIntegration['Params'] = valParams.data;

    const integration = await configService.getProviderConfig(params.providerConfigKey, environment.id);
    if (!integration) {
        res.status(404).send({ error: { code: 'not_found', message: 'Integration does not exist' } });
        return;
    }

    const template = configService.getTemplate(integration.provider);
    let webhookSecret: string | null = null;

    if (template.auth_mode === 'APP' && integration.oauth_client_secret) {
        // const client_secret = Buffer.from(integration.oauth_client_secret, 'base64').toString('ascii');
        const hash = `${integration.oauth_client_id}${integration.oauth_client_secret}${integration.app_link}`;
        webhookSecret = crypto.createHash('sha256').update(hash).digest('hex');
    }

    if (template.auth_mode === 'CUSTOM' && integration.custom) {
        const { private_key } = integration.custom;
        const hash = `${integration.custom['app_id']}${private_key}${integration.app_link}`;
        webhookSecret = crypto.createHash('sha256').update(hash).digest('hex');
    }

    const count = await connectionService.countConnections({ environmentId: environment.id, providerConfigKey: params.providerConfigKey });

    res.status(200).send({
        data: {
            integration: integrationToApi(integration),
            template,
            meta: {
                connectionsCount: count,
                webhookSecret,
                webhookUrl: template.webhook_routing_script ? `${getGlobalWebhookReceiveUrl()}/${environment.uuid}/${integration.unique_key}` : null
            }
        }
    });
});
