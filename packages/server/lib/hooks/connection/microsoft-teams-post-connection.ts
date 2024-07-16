import type { InternalNango as Nango } from './post-connection.js';
import axios from 'axios';

export default async function execute(nango: Nango) {
    const connection = await nango.getConnection();
    const response = await nango.proxy({
        endpoint: '/v1.0/me',
        method: 'GET',
        connectionId: connection.connection_id,
        providerConfigKey: connection.provider_config_key
    });

    if (axios.isAxiosError(response) || !response || !response.data) {
        return;
    }

    const { id } = response.data;

    await nango.updateConnectionConfig({ userId: id });
}
