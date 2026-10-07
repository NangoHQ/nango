import axios from 'axios';

import type { InternalNango as Nango } from '../../internal-nango.js';

/**
 * Store the workspace id (`app.id_code`) so incoming webhooks, which carry it as `app_id`, can be routed to this connection.
 * https://developers.intercom.com/docs/references/2.6/rest-api/admins/view-the-current-admin
 */
export default async function execute(nango: Nango) {
    const connection = await nango.getConnection();
    const response = await nango.proxy({
        endpoint: '/me',
        providerConfigKey: connection.provider_config_key
    });

    if (axios.isAxiosError(response) || !response) {
        return;
    }

    const appId = (response.data as { app?: { id_code?: string } } | undefined)?.app?.id_code;
    if (!appId) {
        return;
    }

    await nango.updateConnectionConfig({ appId });
}
