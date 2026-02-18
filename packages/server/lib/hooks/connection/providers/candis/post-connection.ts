import axios from 'axios';

import type { InternalNango as Nango } from '../../internal-nango.js';

export default async function execute(nango: Nango) {
    const connection = await nango.getConnection();
    const response = await nango.proxy({
        endpoint: 'v1/organizations/info',
        providerConfigKey: connection.provider_config_key
    });

    if (axios.isAxiosError(response) || !response?.data?.id) {
        return;
    }

    const organizationId = response.data.id;
    await nango.updateConnectionConfig({ organizationId });
}
