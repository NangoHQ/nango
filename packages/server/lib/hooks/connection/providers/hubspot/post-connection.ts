import type { InternalNango as Nango } from '../../post-connection.js';
import axios from 'axios';

export default async function execute(nango: Nango) {
    const connection = await nango.getConnection();
    const response = await nango.proxy({
        endpoint: '/account-info/v3/details',
        providerConfigKey: connection.provider_config_key
    });

    if (axios.isAxiosError(response) || !response || !response.data || !response.data.portalId) {
        return;
    }
    const portalId = response.data.portalId;

    await nango.updateConnectionConfig({ portalId });
}
