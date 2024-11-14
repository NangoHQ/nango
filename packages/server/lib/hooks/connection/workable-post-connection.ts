import type { InternalNango as Nango } from './post-connection.js';
import axios from 'axios';

export default async function execute(nango: Nango) {
    const connection = await nango.getConnection();

    const response = await nango.proxy({
        baseUrlOverride: 'https://workable.com',
        endpoint: '/spi/v3/accounts',
        method: 'GET',
        connectionId: connection.connection_id,
        providerConfigKey: connection.provider_config_key
    });

    if (axios.isAxiosError(response) || !response || !response.data) {
        return;
    }

    const subdomain = response.data.accounts[0].subdomain;

    await nango.updateConnectionConfig({ subdomain });
}
