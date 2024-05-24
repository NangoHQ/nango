import type { InternalNango as Nango } from './internal-nango.js';
import get from 'lodash-es/get.js';
import type { Config as ProviderConfig, Connection, ConnectionConfig, ConnectionUpsertResponse } from '@nangohq/shared';
import { environmentService, connectionService, configService, AuthModes as ProviderAuthModes } from '@nangohq/shared';
import { getLogger } from '@nangohq/utils';
import crypto from 'crypto';
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

export default async function route(nango: Nango, integration: ProviderConfig, headers: Record<string, any>, body: any, logContextGetter: LogContextGetter) {
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

    return nango.executeScriptForWebhooks(integration, body, 'installation.id', 'installation_id', logContextGetter);
}

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
        const environment = await environmentService.getById(integration.environment_id);
        const account = await environmentService.getAccountFromEnvironment(integration.environment_id);

        if (!environment || !account) {
            logger.error('Environment or account not found');
            return;
        }

        const installationId = get(body, 'installation.id');
        const [connection] = connections as Connection[];

        // if there is no matching connection or if the connection config already has an installation_id, exit
        if (!connection || connection.connection_config['installation_id']) {
            logger.info('no connection or existing installation_id');
            return;
        }

        const template = configService.getTemplate(integration.provider);

        const activityLogId = connection.connection_config['pendingLog'];
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
        delete connection.connection_config['pendingLog'];

        const connectionConfig = {
            ...connection.connection_config,
            installation_id: installationId
        };

        const logCtx = logContextGetter.get({ id: activityLogId });

        const connCreatedHook = async (res: ConnectionUpsertResponse) => {
            void connectionCreatedHook(
                {
                    id: res.id,
                    connection_id: connection.connection_id,
                    provider_config_key: integration.unique_key,
                    environment,
                    account,
                    auth_mode: ProviderAuthModes.App,
                    operation: res.operation
                },
                integration.provider,
                logContextGetter,
                activityLogId,
                { initiateSync: true, runPostConnectionScript: false },
                logCtx
            );
        };

        await connectionService.getAppCredentialsAndFinishConnection(
            connection.connection_id,
            integration,
            template,
            connectionConfig as ConnectionConfig,
            activityLogId,
            logCtx,
            connCreatedHook
        );
    }
}
