import axios from 'axios';

import type { SophosWhoamiResponse } from './types.js';
import type { InternalNango as Nango } from '../../internal-nango.js';

export default async function execute(nango: Nango) {
    const connection = await nango.getConnection();
    const response = await nango.proxy<SophosWhoamiResponse>({
        method: 'GET',
        endpoint: '/whoami/v1',
        providerConfigKey: connection.provider_config_key,
        baseUrlOverride: 'https://api.central.sophos.com'
    });

    if (!response || axios.isAxiosError(response) || !response.data) {
        return;
    }

    const { id, apiHosts } = response.data;

    if (id && apiHosts.dataRegion) {
        await nango.updateConnectionConfig({
            tenantId: id,
            dataRegion: apiHosts.dataRegion
        });
    }
}
