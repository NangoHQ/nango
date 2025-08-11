import tracer from 'dd-trace';
import * as z from 'zod';

import db from '@nangohq/database';
import { logContextGetter } from '@nangohq/logs';
import { configService, environmentService, getPlan } from '@nangohq/shared';
import { metrics, requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { providerConfigKeySchema } from '../../../helpers/validation.js';
import { asyncWrapper } from '../../../utils/asyncWrapper.js';
import { featureFlags } from '../../../utils/utils.js';
import { routeWebhook } from '../../../webhook/webhook.manager.js';

import type { PostPublicWebhook } from '@nangohq/types';

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

            const resPlan = await getPlan(db.knex, { accountId: account.id });
            if (resPlan.isErr()) {
                res.status(404).send({ error: { code: 'unknown_plan' } });
                return;
            }

            const plan = resPlan.value;

            if (!plan.has_webhooks_forward && !plan.has_webhooks_script) {
                res.status(404).send({ error: { code: 'feature_disabled', message: 'Feature disabled for this account' } });
                return;
            }

            const integration = await configService.getProviderConfig(providerConfigKey, environment.id);
            if (!integration) {
                res.status(404).send({ error: { code: 'unknown_provider_config' } });
                return;
            }

            metrics.increment(metrics.Types.WEBHOOK_INCOMING_RECEIVED);

            const response = await routeWebhook({
                environment,
                account,
                plan,
                integration,
                headers,
                body: req.body,
                rawBody: req.rawBody!,
                logContextGetter
            });

            if (!response) {
                res.status(200).send();
                return;
            }

            res.status(response.statusCode).send(response.content);
        } catch (err) {
            span.setTag('nango.error', err);

            res.status(500).send({ error: { code: 'server_error', message: 'An unexpected error occurred' } });
        }
    });
});
