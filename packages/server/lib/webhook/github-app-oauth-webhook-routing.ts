import crypto from 'crypto';

import get from 'lodash-es/get.js';

import { NangoError, connectionService, environmentService, getProvider } from '@nangohq/shared';
import { Err, Ok, getLogger } from '@nangohq/utils';

import { connectionCreated as connectionCreatedHook } from '../hooks/hooks.js';

import type { InternalNango } from './internal-nango.js';
import type { WebhookHandler } from './types.js';
import type { Config } from '@nangohq/shared';
import type { ConnectionConfig, ConnectionUpsertResponse, IntegrationConfig, ProviderGithubApp } from '@nangohq/types';
import type { Result } from '@nangohq/utils';

const logger = getLogger('Webhook.GithubAppOauth');

function validate(integration: IntegrationConfig, headerSignature: string, rawBody: any): boolean {
    const custom = integration.custom as Record<string, string>;
    const private_key = custom['private_key'];
    const decodedPrivateKey = private_key ? Buffer.from(private_key, 'base64').toString('ascii') : private_key;
    const hash = `${custom['app_id']}${decodedPrivateKey}${integration.app_link}`;
    const secret = crypto.createHash('sha256').update(hash).digest('hex');

    const signature = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

    const trusted = Buffer.from(`sha256=${signature}`, 'ascii');
    const untrusted = Buffer.from(headerSignature, 'ascii');

    return crypto.timingSafeEqual(trusted, untrusted);
}

const route: WebhookHandler = async (nango, headers, body, rawBody) => {
    const signature = headers['x-hub-signature-256'];

    if (signature) {
        const valid = validate(nango.integration, signature, rawBody);

        if (!valid) {
            logger.error('Github App webhook signature invalid. Exiting');
            return Err(new NangoError('webhook_invalid_signature'));
        }
    }

    if (get(body, 'action') === 'created') {
        const createResult = await handleCreateWebhook(nango, body);
        if (createResult.isErr()) {
            return Err(createResult.error);
        }
    }

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
};

async function handleCreateWebhook(nango: InternalNango, body: any): Promise<Result<void, NangoError>> {
    if (!get(body, 'requester.login')) {
        return Ok(undefined);
    }

    const connections = await connectionService.findConnectionsByMultipleConnectionConfigValues(
        { app_id: get(body, 'installation.app_id'), pending: true, handle: get(body, 'requester.login') },
        nango.environment.id
    );

    if (!connections || connections.length === 0) {
        logger.info('No connections found for app_id', get(body, 'installation.app_id'));
        return Ok(undefined);
    } else {
        const environmentAndAccountLookup = await environmentService.getAccountAndEnvironment({ environmentId: nango.environment.id });

        if (!environmentAndAccountLookup) {
            logger.error('Environment or account not found');
            return Ok(undefined);
        }

        const { environment, account } = environmentAndAccountLookup;

        const installationId = get(body, 'installation.id');
        const [connection] = connections;

        // if there is no matching connection or if the connection config already has an installation_id, exit
        if (!connection || connection.connection_config['installation_id']) {
            logger.info('no connection or existing installation_id');
            return Err(new NangoError('webhook_no_connection_or_existing_installation_id'));
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
            installation_id: installationId
        };

        const logCtx = nango.logContextGetter.get({ id: activityLogId, accountId: account.id });

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
                nango.integration,
                nango.logContextGetter,
                { initiateSync: true, runPostConnectionScript: false }
            );
        };

        await connectionService.getAppCredentialsAndFinishConnection(
            connection.connection_id,
            nango.integration as Config,
            provider as ProviderGithubApp,
            connectionConfig,
            logCtx,
            connCreatedHook
        );
        await logCtx.success();

        return Ok(undefined);
    }
}

export default route;
