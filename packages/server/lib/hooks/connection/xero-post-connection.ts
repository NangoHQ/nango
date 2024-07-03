import type { InternalNango as Nango } from './post-connection.js';
import { isAxiosError } from 'axios';

export default async function execute(nango: Nango) {
    const connection = await nango.getConnection();
    const response = await nango.proxy({
        endpoint: 'connections',
        connectionId: connection.connection_id,
        providerConfigKey: connection.provider_config_key
    });

    if (isAxiosError(response) || !response || !response.data || response.data.length === 0 || !response.data[0].id) {
        return;
    }

    const tenant_id = response.data[0]['tenantId'];

    await nango.updateConnectionConfig({ tenant_id });
}
