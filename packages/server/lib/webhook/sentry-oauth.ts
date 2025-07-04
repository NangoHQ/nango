import crypto from 'crypto';

import get from 'lodash-es/get.js';

import { NangoError, connectionService, environmentService, getProvider } from '@nangohq/shared';
import { Err, Ok, getLogger } from '@nangohq/utils';

import oauthController from '../controllers/oauth.controller.js';

import type { SentryOauthWebhookResponse, WebhookHandler } from './types.js';
import type { LogContextGetter } from '@nangohq/logs';
import type { Config as ProviderConfig, OAuthSession } from '@nangohq/shared';
import type { ConnectionConfig, ProviderOAuth2 } from '@nangohq/types';
import type { Result } from '@nangohq/utils';

const logger = getLogger('Webhook.SentryOauth');

export function validate(request: { body: any; headers: Record<string, string> }, secret: string): boolean {
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(JSON.stringify(request.body), 'utf8');
    const digest = hmac.digest('hex');
    return digest === request.headers['sentry-hook-signature'];
}

const route: WebhookHandler = async (nango, integration, headers, body, _rawBody, logContextGetter: LogContextGetter) => {
    const signature = headers['sentry-hook-signature'];
    if (signature) {
        const valid = validate({ body, headers }, integration.oauth_client_secret);
        if (!valid) {
            logger.error('Sentry Oauth webhook signature invalid. Exiting');
            return Err(new NangoError('webhook_invalid_signature'));
        }
    }

    if (get(body, 'action') === 'created' && headers['sentry-hook-resource'] === 'installation') {
        const createResult = await handleCreateWebhook(integration, body, logContextGetter);
        if (createResult.isErr()) {
            return Err(createResult.error);
        }
    }

    try {
        const response = await nango.executeScriptForWebhooks(integration, body, 'action', 'installation.id', logContextGetter, 'installation_id');
        return Ok({
            content: { status: 'success' },
            statusCode: 200,
            connectionIds: response?.connectionIds || [],
            toForward: body
        });
    } catch (err) {
        logger.error('Failed to execute script for webhooks', err);
        return Ok({
            content: { status: 'skipped due to internal error' },
            statusCode: 500
        });
    }
};

async function handleCreateWebhook(
    integration: ProviderConfig,
    body: SentryOauthWebhookResponse,
    logContextGetter: LogContextGetter
): Promise<Result<void, NangoError>> {
    if (!get(body, 'actor.id')) {
        return Ok(undefined);
    }

    const connections = await connectionService.findConnectionsByMultipleConnectionConfigValues(
        { actor: String(get(body, 'actor.id')), pending: true },
        integration.environment_id
    );

    if (!connections || connections.length === 0) {
        logger.info('No connections found for actor', String(get(body, 'actor.id')));
        return Ok(undefined);
    } else {
        const environmentAndAccountLookup = await environmentService.getAccountAndEnvironment({ environmentId: integration.environment_id });

        if (!environmentAndAccountLookup) {
            logger.error('Environment or account not found');
            return Ok(undefined);
        }

        const { account } = environmentAndAccountLookup;

        const [connection] = connections;

        // if there is no matching connection found, exit
        if (!connection) {
            logger.info('no connection found');
            return Err(new NangoError('webhook_no_connection'));
        }

        const provider = getProvider(integration.provider);
        if (!provider) {
            logger.error('unknown provider');
            return Err(new NangoError('webhook_unknown_provider'));
        }

        const activityLogId = connection.connection_config['pendingLog'];

        delete connection.connection_config['pendingLog'];

        const connectionConfig: ConnectionConfig = {
            ...connection.connection_config,
            actor: get(body, 'actor')
        };

        const logCtx = logContextGetter.get({ id: activityLogId, accountId: account.id });
        const session: OAuthSession = {
            providerConfigKey: connection.provider_config_key,
            provider: integration.provider,
            connectionId: connection.connection_id,
            callbackUrl: '',
            authMode: 'OAUTH2',
            id: '',
            connectSessionId: null,
            connectionConfig,
            environmentId: integration.environment_id,
            webSocketClientId: undefined,
            activityLogId: activityLogId,
            codeVerifier: ''
        };

        try {
            await oauthController.oauth2WebhookInstallation(
                provider as ProviderOAuth2,
                integration,
                session,
                body,
                environmentAndAccountLookup.environment,
                account,
                logCtx
            );

            return Ok(undefined);
        } catch (err) {
            logger.error('Error in oauth2Webhook handler', err);
            return Err(new NangoError('webhook_oauth2webhook_failed'));
        }
    }
}

export default route;
