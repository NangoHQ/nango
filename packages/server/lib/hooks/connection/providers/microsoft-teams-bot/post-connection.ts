import axios from 'axios';

import type { BotFrameworkTokenResponse } from './types.js';
import type { InternalNango as Nango } from '../../internal-nango.js';

const BOT_FRAMEWORK_SCOPE = 'https://api.botframework.com/.default';

export default async function execute(nango: Nango) {
    const connection = await nango.getConnection();
    const integration = await nango.getIntegration();

    const botHostTenantId = connection.connection_config?.['botHostTenantId'] as string | undefined;
    if (!botHostTenantId) {
        return;
    }

    if (!integration?.oauth_client_id || !integration?.oauth_client_secret) {
        return;
    }

    const params = new URLSearchParams({
        client_id: integration.oauth_client_id,
        client_secret: integration.oauth_client_secret,
        grant_type: 'client_credentials',
        scope: BOT_FRAMEWORK_SCOPE
    });

    const tokenResponse = await nango.proxy<BotFrameworkTokenResponse>({
        method: 'POST',
        baseUrlOverride: 'https://login.microsoftonline.com',
        endpoint: `/${botHostTenantId}/oauth2/v2.0/token`,
        providerConfigKey: connection.provider_config_key,
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        data: params.toString()
    });

    if (!tokenResponse || axios.isAxiosError(tokenResponse) || !tokenResponse.data?.access_token) {
        return;
    }

    const expires_at = Date.now() + tokenResponse.data.expires_in * 1000;
    const botFrameworkAccessToken = {
        access_token: tokenResponse.data.access_token,
        expires_in: tokenResponse.data.expires_in,
        expires_at
    };

    await nango.updateConnectionConfig({ botFrameworkAccessToken });
}
