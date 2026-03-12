import axios from 'axios';

import type { InternalNango as Nango } from '../../internal-nango.js';

interface GmailProfileResponse {
    emailAddress?: string;
}

export default async function execute(nango: Nango) {
    const connection = await nango.getConnection();

    const response = await nango.proxy<GmailProfileResponse>({
        endpoint: '/gmail/v1/users/me/profile',
        providerConfigKey: connection.provider_config_key
    });

    if (axios.isAxiosError(response) || !response?.data?.emailAddress) {
        return;
    }

    await nango.updateConnectionConfig({ emailAddress: response.data.emailAddress });
}
