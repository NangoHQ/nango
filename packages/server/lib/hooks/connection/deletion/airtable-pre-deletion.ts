import type { InternalNango as Nango } from './post-connection.js';
import type { Connection } from '@nangohq/shared';

export default async function execute(nango: Nango, connection: Connection) {
    const config = {
        endpoint: '/v0/meta/bases',
        connectionId: connection.connection_id,
        providerConfigKey: connection.provider_config_key,
        paginate: {
            type: 'cursor',
            cursor_path_in_response: 'offset',
            cursor_name_in_request: 'offset',
            response_path: 'bases'
        }
    };

    for await (const bases of nango.paginate(config)) {
        for (const base of bases) {
            const webhookConfig = {
                connectionId: connection.connection_id,
                providerConfigKey: connection.provider_config_key,
                endpoint: `/v0/bases/${base.id}/webhooks`
            };

            const response = await nango.get(webhookConfig);

            const { data } = response;

            const { id } = data;
            const deleteConfig = {
                connectionId: connection.connection_id,
                providerConfigKey: connection.provider_config_key,
                endpoint: `/v0/bases/${base.id}/webhooks/${id}`
            };

            await nango.delete(deleteConfig);
        }
    }
}

