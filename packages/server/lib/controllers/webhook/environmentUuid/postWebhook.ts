import { metrics, requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';
import { asyncWrapper } from '../../../utils/asyncWrapper.js';
import { logContextGetter } from '@nangohq/logs';
import tracer from 'dd-trace';
import { z } from 'zod';
import { providerConfigKeySchema } from '../../../helpers/validation.js';
import { configService, environmentService, featureFlags } from '@nangohq/shared';
import type { PostPublicWebhook } from '@nangohq/types';

import { routeWebhook } from '../../../webhook/webhook.manager.js';

const paramValidation = z
    .object({
        environmentUuid: z.string().uuid(),
        providerConfigKey: providerConfigKeySchema
    })
    .strict();

export const postWebhook = asyncWrapper<PostPublicWebhook>(async (req, res) => {
    const emptyQuery = requireEmptyQuery(req);
    if (emptyQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
        return;
    }

    const paramValue = paramValidation.safeParse(req.params);
    if (!paramValue.success) {
        res.status(400).send({ error: { code: 'invalid_uri_params', errors: zodErrorToHTTP(paramValue.error) } });
        return;
    }

    await tracer.trace('server.sync.receiveWebhook', async (span) => {
        const { environmentUuid, providerConfigKey }: PostPublicWebhook['Params'] = req.params;
        const headers = req.headers;

        try {
            const isGloballyEnabled = await featureFlags.isEnabled('external-webhooks', 'global', true, true);
            if (!isGloballyEnabled) {
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

            const areWebhooksEnabled = await featureFlags.isEnabled('external-webhooks', account.uuid, true, true);
            if (!areWebhooksEnabled) {
                res.status(404).send({ error: { code: 'feature_disabled', message: 'Feature disabled for this account' } });
                return;
            }

            const integration = await configService.getProviderConfig(providerConfigKey, environment.id);
            if (!integration) {
                res.status(404).send({ error: { code: 'unknown_provider_config' } });
                return;
            }

            const startTime = Date.now();
            const responsePayload = await routeWebhook({ environment, account, integration, headers, body: req.body, rawBody: req.rawBody!, logContextGetter });
            const endTime = Date.now();
            const totalRunTime = (endTime - startTime) / 1000;

            metrics.duration(metrics.Types.WEBHOOK_TRACK_RUNTIME, totalRunTime);

            if (!responsePayload) {
                res.status(200).send();
                return;
            }

            res.status(200).send(responsePayload);
        } catch (err) {
            span.setTag('nango.error', err);

            res.status(500).send({ error: { code: 'server_error', message: 'An unexpected error occurred' } });
        }
    });
});
