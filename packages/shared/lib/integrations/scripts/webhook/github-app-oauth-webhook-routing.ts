import type { InternalNango as Nango } from './internal-nango.js';
import get from 'lodash-es/get.js';
import type { Config as ProviderConfig } from '../../../models/Provider.js';
import type { Connection, ConnectionConfig } from '../../../models/Connection.js';
import connectionService from '../../../services/connection.service.js';
import configService from '../../../services/config.service.js';
import crypto from 'crypto';

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

export default async function route(nango: Nango, integration: ProviderConfig, headers: Record<string, any>, body: any) {
    const signature = headers['x-hub-signature-256'];

    if (signature) {
        const valid = validate(integration, signature, body);

        if (!valid) {
            console.log('Github App webhook signature invalid. Exiting');
            return;
        }
    }

    if (get(body, 'action') === 'created') {
        await handleCreateWebhook(integration, body);
    }

    await nango.executeScriptForWebhooks(integration, body, 'installation.id', 'installation_id');
}

async function handleCreateWebhook(integration: ProviderConfig, body: any) {
    if (!get(body, 'requester.login')) {
        return;
    }

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

        // if there is no matching connection or if the connection config already has an installation_id, exit
        if (!connection || connection.connection_config['installation_id']) {
            console.log('no connection or existing installation_id');
            return;
        }

        const template = configService.getTemplate(integration?.provider as string);

        const activityLogId = connection.connection_config['pendingLog'];
        delete connection.connection_config['pendingLog'];
        delete connection.connection_config['pending'];

        const connectionConfig = {
            ...connection.connection_config,
            installation_id: installationId
        };

        await connectionService.getAppCredentialsAndFinishConnection(
            connection.connection_id,
            integration,
            template,
            connectionConfig as ConnectionConfig,
            activityLogId
        );
    }
}
