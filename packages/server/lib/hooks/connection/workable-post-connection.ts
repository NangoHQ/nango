import type { InternalNango as Nango } from './post-connection.js';
import { isAxiosError } from 'axios';
import type { WorkableAccountsResponse } from '../response-types/workable.js';

export default async function execute(nango: Nango) {
    const connection = await nango.getConnection();

    // rely on the customer provided subdomain if possible
    if (connection.connection_config?.['subdomain']) {
        return;
    }

    const response = await nango.proxy<WorkableAccountsResponse>({
        baseUrlOverride: 'https://workable.com',
        endpoint: '/spi/v3/accounts',
        method: 'GET',
        connectionId: connection.connection_id,
        providerConfigKey: connection.provider_config_key
    });

    if (isAxiosError(response) || !response || !response.data) {
        throw new Error('Failed to retrieve Workable subdomain');
    }

    const subdomain = response.data.accounts[0]?.subdomain;

    await nango.updateConnectionConfig({ subdomain });
}
