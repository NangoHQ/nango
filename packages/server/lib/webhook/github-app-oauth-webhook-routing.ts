import crypto from 'crypto';

import get from 'lodash-es/get.js';

import { WebhookRoutingError, connectionService, environmentService, getProvider } from '@nangohq/shared';
import { getLogger } from '@nangohq/utils';

import { connectionCreated as connectionCreatedHook } from '../hooks/hooks.js';

import type { WebhookHandler } from './types.js';
import type { LogContextGetter } from '@nangohq/logs';
import type { Config as ProviderConfig, ConnectionUpsertResponse } from '@nangohq/shared';
import type { ConnectionConfig, ProviderGithubApp } from '@nangohq/types';

const logger = getLogger('Webhook.GithubAppOauth');

function validate(integration: ProviderConfig, headerSignature: string, body: any): boolean {
    const custom = integration.custom as Record<string, string>;
    const private_key = custom['private_key'];
    const hash = `${custom['app_id']}${private_key}${integration.app_link}`;
    const secret = crypto.createHash('sha256').update(hash).digest('hex');

    const signature = crypto.createHmac('sha256', secret).update(JSON.stringify(body)).digest('hex');

    const trusted = Buffer.from(`sha256=${signature}`, 'ascii');
    const untrusted = Buffer.from(headerSignature, 'ascii');

    return crypto.timingSafeEqual(trusted, untrusted);
}

const route: WebhookHandler = async (nango, integration, headers, body, _rawBody, logContextGetter: LogContextGetter) => {
    const signature = headers['x-hub-signature-256'];

    if (signature) {
        const valid = validate(integration, signature, body);

        if (!valid) {
            logger.error('Github App webhook signature invalid. Exiting');
            throw new WebhookRoutingError('invalid_signature');
        }
    }

    if (get(body, 'action') === 'created') {
        await handleCreateWebhook(integration, body, logContextGetter);
    }

    const response = await nango.executeScriptForWebhooks(integration, body, 'action', 'installation.id', logContextGetter, 'installation_id');
    return {
        content: { status: 'success' },
        statusCode: 200,
        connectionIds: response?.connectionIds || [],
        toForward: body
    };
};

async function handleCreateWebhook(integration: ProviderConfig, body: any, logContextGetter: LogContextGetter) {
    if (!get(body, 'requester.login')) {
        return;
    }

    const connections = await connectionService.findConnectionsByMultipleConnectionConfigValues(
        { app_id: get(body, 'installation.app_id'), pending: true, handle: get(body, 'requester.login') },
        integration.environment_id
    );

    if (!connections || connections.length === 0) {
        logger.info('No connections found for app_id', get(body, 'installation.app_id'));
        return;
    } else {
        const environmentAndAccountLookup = await environmentService.getAccountAndEnvironment({ environmentId: integration.environment_id });

        if (!environmentAndAccountLookup) {
            logger.error('Environment or account not found');
            return;
        }

        const { environment, account } = environmentAndAccountLookup;

        const installationId = get(body, 'installation.id');
        const [connection] = connections;

        // if there is no matching connection or if the connection config already has an installation_id, exit
        if (!connection || connection.connection_config['installation_id']) {
            logger.info('no connection or existing installation_id');
            throw new WebhookRoutingError('no_connection_or_existing_installation_id');
        }

        const provider = getProvider(integration.provider);
        if (!provider) {
            logger.error('unknown provider');
            throw new WebhookRoutingError('unknown_provider');
        }

        const activityLogId = connection.connection_config['pendingLog'];

        delete connection.connection_config['pendingLog'];

        const connectionConfig: ConnectionConfig = {
            ...connection.connection_config,
            installation_id: installationId
        };

        const logCtx = logContextGetter.get({ id: activityLogId, accountId: account.id });

        const connCreatedHook = (res: ConnectionUpsertResponse) => {
            void connectionCreatedHook(
                {
                    connection: res.connection,
                    environment,
                    account,
                    auth_mode: 'APP',
                    operation: res.operation,
                    endUser: undefined // TODO fix this
                },
                account,
                integration,
                logContextGetter,
                { initiateSync: true, runPostConnectionScript: false }
            );
        };

        await connectionService.getAppCredentialsAndFinishConnection(
            connection.connection_id,
            integration,
            provider as ProviderGithubApp,
            connectionConfig,
            logCtx,
            connCreatedHook
        );
        await logCtx.success();
    }
}

export default route;
