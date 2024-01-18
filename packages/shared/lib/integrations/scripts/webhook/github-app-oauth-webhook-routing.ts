import type { InternalNango as Nango } from './webhook.manager.js';
import get from 'lodash-es/get.js';
import type { Config as ProviderConfig } from '../../../models/Provider.js';
import type { AuthCredentials } from '../../../models/Auth.js';
import type { Connection, ConnectionConfig } from '../../../models/Connection.js';
import connectionService from '../../../services/connection.service.js';
import environmentService from '../../../services/environment.service.js';
import { updateSuccess as updateSuccessActivityLog, createActivityLogMessageAndEnd } from '../../../services/activity/activity.service.js';
import configService from '../../../services/config.service.js';
import { connectionCreated as connectionCreatedHook } from '../../../hooks/hooks.js';
import crypto from 'crypto';

function validate(integration: ProviderConfig, headerSignature: string, body: any): boolean {
    const custom = integration.custom as Record<string, string>;
    console.log(custom);
    const private_key = custom['private_key'];
    const hash = `${custom['app_id']}${private_key}${integration.app_link}`;
    console.log(private_key);
    console.log(hash);
    const secret = crypto.createHash('sha256').update(hash).digest('hex');

    const signature = crypto.createHmac('sha256', secret).update(JSON.stringify(body)).digest('hex');

    const trusted = Buffer.from(`sha256=${signature}`, 'ascii');
    const untrusted = Buffer.from(headerSignature, 'ascii');

    return crypto.timingSafeEqual(trusted, untrusted);
}

export default async function route(nango: Nango, integration: ProviderConfig, headers: Record<string, any>, body: any) {
    const signature = headers['x-hub-signature-256'];

    if (signature) {
        console.log('Signature found, verifying...');
        const valid = validate(integration, signature, body);

        if (!valid) {
            console.log('Github App webhook signature invalid, but continuing');
            return;
        }
    }

    if (get(body, 'action') === 'created') {
        await handleCreateWebhook(integration, body);

        return;
    }

    await nango.executeScriptForWebhooks(integration, body, 'installation.id', 'installation_id');
}

async function handleCreateWebhook(integration: ProviderConfig, body: any) {
    const connections = await connectionService.findConnectionsByMultipleConnectionConfigValues(
        { app_id: get(body, 'installation.app_id'), pending: true, handle: get(body, 'requester.login') },
        integration.environment_id
    );

    if (connections?.length === 0) {
        console.log('No connections found for app_id', get(body, 'installation.app_id'));
        return;
    } else {
        const installationId = get(body, 'installation.id');
        const [connection] = connections as Connection[];

        if (!connection) {
            return;
        }

        console.log('Finishing install for', installationId, connection?.id);

        const template = await configService.getTemplate(integration?.provider as string);

        const activityLogId = connection.connection_config['pendingLog'];
        delete connection.connection_config['pendingLog'];
        delete connection.connection_config['pending'];

        const connectionConfig = {
            ...connection.connection_config,
            installation_id: installationId
        };

        const {
            success,
            error,
            response: credentials
        } = await connectionService.getAppCredentials(template, integration, connectionConfig as ConnectionConfig);

        if (!success || !credentials) {
            console.log(error);
            return;
        }

        const accountId = await environmentService.getAccountIdFromEnvironment(integration.environment_id);

        const [updatedConnection] = await connectionService.upsertConnection(
            connection.connection_id,
            integration.unique_key,
            integration.provider,
            credentials as unknown as AuthCredentials,
            connectionConfig,
            integration.environment_id,
            accountId as number
        );

        if (updatedConnection) {
            await connectionCreatedHook(
                {
                    id: updatedConnection.id,
                    connection_id: connection.connection_id,
                    provider_config_key: integration.unique_key,
                    environment_id: integration.environment_id
                },
                integration.provider,
                true,
                false
            );
        }

        await createActivityLogMessageAndEnd({
            level: 'info',
            environment_id: integration.environment_id,
            activity_log_id: Number(activityLogId),
            content: 'App connection was approved and credentials were saved',
            timestamp: Date.now()
        });

        await updateSuccessActivityLog(Number(activityLogId), true);
    }
}
