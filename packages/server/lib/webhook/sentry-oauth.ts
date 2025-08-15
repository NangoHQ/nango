import crypto from 'crypto';

import get from 'lodash-es/get.js';

import { NangoError, connectionService, getProvider } from '@nangohq/shared';
import { Err, Ok, getLogger } from '@nangohq/utils';

import oauthController from '../controllers/oauth.controller.js';

import type { InternalNango } from './internal-nango.js';
import type { SentryOauthWebhookResponse, WebhookHandler } from './types.js';
import type { Config, OAuthSession } from '@nangohq/shared';
import type { ConnectionConfig, ProviderOAuth2 } from '@nangohq/types';
import type { Result } from '@nangohq/utils';

const logger = getLogger('Webhook.SentryOauth');

export function validate(request: { body: any; headers: Record<string, string> }, secret: string): boolean {
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(JSON.stringify(request.body), 'utf8');
    const digest = hmac.digest('hex');
    return digest === request.headers['sentry-hook-signature'];
}

const route: WebhookHandler = async (nango, headers, body) => {
    const signature = headers['sentry-hook-signature'];
    if (signature) {
        const valid = validate({ body, headers }, nango.integration.oauth_client_secret!);
        if (!valid) {
            logger.error('Sentry Oauth webhook signature invalid. Exiting');
            return Err(new NangoError('webhook_invalid_signature'));
        }
    }

    if (get(body, 'action') === 'created' && headers['sentry-hook-resource'] === 'installation') {
        const createResult = await handleCreateWebhook(nango, body);
        if (createResult.isErr()) {
            return Err(createResult.error);
        }
    }

    try {
        const response = await nango.executeScriptForWebhooks({
            body,
            webhookType: 'action',
            connectionIdentifier: 'installation.id',
            propName: 'installation_id'
        });
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

async function handleCreateWebhook(nango: InternalNango, body: SentryOauthWebhookResponse): Promise<Result<void, NangoError>> {
    if (!get(body, 'actor.id')) {
        return Ok(undefined);
    }

    const connections = await connectionService.findConnectionsByMultipleConnectionConfigValues(
        { actor: String(get(body, 'actor.id')), pending: true },
        nango.environment.id
    );

    if (!connections || connections.length === 0) {
        logger.info('No connections found for actor', String(get(body, 'actor.id')));
        return Ok(undefined);
    } else {
        const [connection] = connections;

        // if there is no matching connection found, exit
        if (!connection) {
            logger.info('no connection found');
            return Err(new NangoError('webhook_no_connection'));
        }

        const provider = getProvider(nango.integration.provider);
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

        const logCtx = nango.logContextGetter.get({ id: activityLogId, accountId: nango.team.id });
        const session: OAuthSession = {
            providerConfigKey: connection.provider_config_key,
            provider: nango.integration.provider,
            connectionId: connection.connection_id,
            callbackUrl: '',
            authMode: 'OAUTH2',
            id: '',
            connectSessionId: null,
            connectionConfig,
            environmentId: nango.environment.id,
            webSocketClientId: undefined,
            activityLogId: activityLogId,
            codeVerifier: ''
        };

        try {
            await oauthController.oauth2WebhookInstallation(
                provider as ProviderOAuth2,
                nango.integration as Config,
                session,
                body,
                nango.environment,
                nango.team,
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
