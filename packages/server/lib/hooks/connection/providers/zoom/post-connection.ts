import axios from 'axios';

import type { InternalNango as Nango } from '../../internal-nango.js';

export default async function execute(nango: Nango) {
    const connection = await nango.getConnection();
    const response = await nango.proxy({
        endpoint: '/users/me',
        providerConfigKey: connection.provider_config_key
    });

    if (axios.isAxiosError(response) || !response || !response.data || !response.data.account_id) {
        return;
    }

    await nango.updateConnectionConfig({ accountId: response.data.account_id });
}
