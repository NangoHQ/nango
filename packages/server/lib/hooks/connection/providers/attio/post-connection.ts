import axios from 'axios';

import type { InternalNango as Nango } from '../../internal-nango.js';
import type { AttioTokenResponse } from './types.js';

export default async function execute(nango: Nango) {
    const connection = await nango.getConnection();

    const response = await nango.proxy<AttioTokenResponse>({
        method: 'GET',
        endpoint: `/v2/self`,
        providerConfigKey: connection.provider_config_key
    });

    if (!response || axios.isAxiosError(response) || !response.data.workspace_id) {
        return;
    }

    const { workspace_id } = response.data;
    await nango.updateConnectionConfig({ workspace_id });
}
