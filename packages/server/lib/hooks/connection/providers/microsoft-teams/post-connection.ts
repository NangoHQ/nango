import type { InternalNango as Nango } from '../../post-connection.js';
import axios from 'axios';

export default async function execute(nango: Nango) {
    const connection = await nango.getConnection();
    const response = await nango.proxy({
        endpoint: '/v1.0/organization',
        method: 'GET',
        providerConfigKey: connection.provider_config_key
    });

    if (axios.isAxiosError(response) || !response || !response.data) {
        return;
    }

    const [{ id }] = response.data.value;

    await nango.updateConnectionConfig({ tenantId: id });
}
