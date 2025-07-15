import {
    accountService,
    connectionService,
    environmentService,
    externalWebhookService,
    generateSlackConnectionId,
    getGlobalWebhookReceiveUrl,
    getWebsocketsPath
} from '@nangohq/shared';
import { isCloud, requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { envs } from '../../../env.js';
import { environmentToApi } from '../../../formatters/environment.js';
import { planToApi } from '../../../formatters/plan.js';
import { webhooksToApi } from '../../../formatters/webhooks.js';
import { asyncWrapper } from '../../../utils/asyncWrapper.js';

import type { GetEnvironment } from '@nangohq/types';

export const getEnvironment = asyncWrapper<GetEnvironment>(async (req, res) => {
    const emptyQuery = requireEmptyQuery(req, { withEnv: true });
    if (emptyQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
        return;
    }

    const { environment, account, user, plan } = res.locals;

    if (!isCloud) {
        environment.websockets_path = getWebsocketsPath();
        if (process.env[`NANGO_SECRET_KEY_${environment.name.toUpperCase()}`]) {
            environment.secret_key = process.env[`NANGO_SECRET_KEY_${environment.name.toUpperCase()}`] as string;
            environment.secret_key_rotatable = false;
        }

        if (process.env[`NANGO_PUBLIC_KEY_${environment.name.toUpperCase()}`]) {
            environment.public_key = process.env[`NANGO_PUBLIC_KEY_${environment.name.toUpperCase()}`] as string;
            environment.public_key_rotatable = false;
        }
    }

    environment.callback_url = await environmentService.getOauthCallbackUrl(environment.id);
    const webhookBaseUrl = getGlobalWebhookReceiveUrl();
    environment.webhook_receive_url = `${webhookBaseUrl}/${environment.uuid}`;

    let slack_notifications_channel = '';
    if (environment.slack_notifications) {
        const connectionId = generateSlackConnectionId(account.uuid, environment.name);
        const integrationId = envs.NANGO_SLACK_INTEGRATION_KEY;
        const env = 'prod';
        const info = await accountService.getAccountAndEnvironmentIdByUUID(envs.NANGO_ADMIN_UUID!, env);
        if (info) {
            const connectionConfig = await connectionService.getConnectionConfig({
                provider_config_key: integrationId,
                environment_id: info.environmentId,
                connection_id: connectionId
            });
            if (connectionConfig && connectionConfig['incoming_webhook.channel']) {
                slack_notifications_channel = connectionConfig['incoming_webhook.channel'];
            }
        }
    }

    const environmentVariables = await environmentService.getEnvironmentVariables(environment.id);

    const webhookSettings = await externalWebhookService.get(environment.id);

    res.status(200).send({
        plan: plan ? planToApi(plan) : null,
        environmentAndAccount: {
            environment: environmentToApi(environment),
            env_variables:
                environmentVariables?.map((envVar) => {
                    return { name: envVar.name, value: envVar.value };
                }) || [],
            webhook_settings: webhooksToApi(
                webhookSettings || {
                    id: 0,
                    environment_id: 0,
                    created_at: new Date(),
                    updated_at: new Date(),
                    on_auth_creation: false,
                    on_auth_refresh_error: false,
                    on_sync_completion_always: false,
                    on_async_action_completion: false,
                    on_sync_error: false,
                    primary_url: null,
                    secondary_url: null
                }
            ),
            uuid: account.uuid,
            name: account.name,
            email: user.email,
            slack_notifications_channel
        }
    });
});
