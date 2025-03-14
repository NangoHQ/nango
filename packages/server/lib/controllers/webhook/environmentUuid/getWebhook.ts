import { asyncWrapper } from '../../../utils/asyncWrapper.js';
import tracer from 'dd-trace';
import { z } from 'zod';
import { providerConfigKeySchema } from '../../../helpers/validation.js';
import { configService, environmentService } from '@nangohq/shared';

// TODO: import type { GetPublicWebhook } from '@nangohq/types';

import { featureFlags } from '../../../utils/utils.js';
import { zodErrorToHTTP } from '@nangohq/utils';

// TODO: check how to handle this get request and appropriate file location
const paramValidation = z
    .object({
        environmentUuid: z.string().uuid(),
        providerConfigKey: providerConfigKeySchema
    })
    .strict();

export const getWebhook = asyncWrapper(async (req, res) => {
    const paramValue = paramValidation.safeParse(req.params);
    if (!paramValue.success) {
        res.status(400).send({ error: { code: 'invalid_uri_params', errors: zodErrorToHTTP(paramValue.error) } });
        return;
    }

    await tracer.trace('server.sync.receiveWebhookVerification', async (span) => {
        // const { environmentUuid, providerConfigKey }: GetPublicWebhook['Params'] = req.params;
        const { environmentUuid, providerConfigKey } = req.params;

        const query = req.query;

        try {
            const isGloballyDisabled = await featureFlags.isSet('disable-external-webhooks');
            if (isGloballyDisabled) {
                res.status(404).send({ error: { code: 'feature_disabled', message: 'Feature globally disabled' } });
                return;
            }

            const resEnv = await environmentService.getAccountAndEnvironment({ environmentUuid });
            if (!resEnv) {
                res.status(404).send({ error: { code: 'unknown_environment' } });
                return;
            }

            const { environment, account } = resEnv;
            span.setTag('nango.accountUUID', account.uuid);
            span.setTag('nango.environmentUUID', environmentUuid);
            span.setTag('nango.providerConfigKey', providerConfigKey);

            const isDisabledForThisAccount = await featureFlags.isSet('disable-external-webhooks', { distinctId: account.uuid });
            if (isDisabledForThisAccount) {
                res.status(404).send({ error: { code: 'feature_disabled', message: 'Feature disabled for this account' } });
                return;
            }

            const integration = await configService.getProviderConfig(providerConfigKey, environment.id);
            if (!integration) {
                res.status(404).send({ error: { code: 'unknown_provider_config' } });
                return;
            }

            // TODO: Find scalable way to handle GET verification requests (works for Dropbox)
            if (providerConfigKey === 'dropbox' && query['challenge']) {
                // Adding proper security headers as per Dropbox documentation
                res.setHeader('Content-Type', 'text/plain');
                res.setHeader('X-Content-Type-Options', 'nosniff');
                res.status(200).send(query['challenge']);
                return;
            }

            // Default response if no verification logic matches
            res.status(405).send({ error: { code: 'method_not_allowed', message: 'GET method not supported for this provider' } });
        } catch (err) {
            span.setTag('nango.error', err);
            res.status(500).send({ error: { code: 'server_error', message: 'An unexpected error occurred' } });
        }
    });
});
