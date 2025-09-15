import axios from 'axios';

import type { BullhornEndpoints } from './types.js';
import type { InternalNango } from '../../internal-nango.js';

export default async function execute(nango: InternalNango): Promise<void> {
    const { connection_config, provider_config_key } = await nango.getConnection();

    if (!connection_config['username']) {
        return;
    }

    const response = await nango.proxy<BullhornEndpoints>({
        baseUrlOverride: 'https://rest.bullhornstaffing.com',
        method: 'GET',
        endpoint: '/rest-services/loginInfo',
        providerConfigKey: provider_config_key,
        params: {
            username: connection_config['username']
        }
    });

    if (!response || axios.isAxiosError(response) || !response.data || !response.data.restUrl) {
        return;
    }

    const restUrl = response.data.restUrl;
    const match = restUrl.match(/^https:\/\/rest-(.+?)\.bullhornstaffing\.com/);
    const subdomain = match ? match[1] : undefined;

    await nango.updateConnectionConfig({
        ...connection_config,
        restUrl,
        subdomain
    });
}
