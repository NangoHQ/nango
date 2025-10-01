import axios from 'axios';

import type { InternalNango as Nango } from '../../internal-nango.js';
import type { OAuth2Credentials } from '@nangohq/types';

export default async function execute(nango: Nango) {
    const connection = await nango.getConnection();
    const response = await nango.proxy({
        endpoint: `/user`,
        providerConfigKey: connection.provider_config_key
    });

    if (axios.isAxiosError(response) || !response || !response.data) {
        return;
    }

    const handle = response.data.login;

    let updatedConfig: Record<string, string | OAuth2Credentials> = {
        handle
    };

    if (connection.credentials.type === 'OAUTH2') {
        updatedConfig = {
            ...updatedConfig,
            userCredentials: connection.credentials
        };
    }

    await nango.updateConnectionConfig(updatedConfig);
}
