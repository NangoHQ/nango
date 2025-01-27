import get from 'lodash-es/get.js';
import type { Config as ProviderConfig, Connection, ConnectionConfig, ConnectionUpsertResponse } from '@nangohq/shared';
import { environmentService, connectionService, getProvider } from '@nangohq/shared';
import { getLogger } from '@nangohq/utils';
import crypto from 'crypto';
import type { WebhookHandler } from './types.js';
import type { LogContextGetter } from '@nangohq/logs';
import { connectionCreated as connectionCreatedHook } from '../hooks/hooks.js';

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
            return;
        }
    }

    if (get(body, 'action') === 'created') {
        await handleCreateWebhook(integration, body, logContextGetter);
    }

    return nango.executeScriptForWebhooks(integration, body, 'action', 'installation.id', logContextGetter, 'installation_id');
};

async function handleCreateWebhook(integration: ProviderConfig, body: any, logContextGetter: LogContextGetter) {
    if (!get(body, 'requester.login')) {
        return;
    }

    const connections = await connectionService.findConnectionsByMultipleConnectionConfigValues(
        { app_id: get(body, 'installation.app_id'), pending: true, handle: get(body, 'requester.login') },
        integration.environment_id
    );

    if (connections?.length === 0) {
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
        const [connection] = connections as Connection[];

        // if there is no matching connection or if the connection config already has an installation_id, exit
        if (!connection || connection.connection_config['installation_id']) {
            logger.info('no connection or existing installation_id');
            return;
        }

        const provider = getProvider(integration.provider);
        if (!provider) {
            logger.error('unknown provider');
            return;
        }

        const activityLogId = connection.connection_config['pendingLog'];

        delete connection.connection_config['pendingLog'];

        const connectionConfig = {
            ...connection.connection_config,
            installation_id: installationId
        };

        const logCtx = await logContextGetter.get({ id: activityLogId });

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
                integration.provider,
                logContextGetter,
                { initiateSync: true, runPostConnectionScript: false },
                logCtx
            );
        };

        await connectionService.getAppCredentialsAndFinishConnection(
            connection.connection_id,
            integration,
            provider,
            connectionConfig as ConnectionConfig,
            logCtx,
            connCreatedHook
        );
        await logCtx.success();
    }
}

export default route;
