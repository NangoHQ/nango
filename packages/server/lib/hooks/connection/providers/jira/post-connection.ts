import axios from 'axios';

import type { InternalNango as Nango } from '../../post-connection.js';

export default async function execute(nango: Nango) {
    const connection = await nango.getConnection();
    const connectionConfig = connection.connection_config || {};

    const response = await nango.proxy({
        endpoint: `oauth/token/accessible-resources`,
        providerConfigKey: connection.provider_config_key
    });

    if (axios.isAxiosError(response) || !response || !response.data || response.data.length === 0 || !response.data[0].id) {
        return;
    }

    // If baseUrl is provided, find the matching site
    let site = response.data[0]; // Default to first site
    if (connectionConfig['baseUrl']?.length) {
        const matchingSite = response.data.find((s: any) => s.url === connectionConfig['baseUrl']);
        if (!matchingSite) {
            return;
        }
        site = matchingSite;
    }

    const accountResponse = await nango.proxy({
        endpoint: `ex/jira/${site.id}/rest/api/3/myself`,
        providerConfigKey: connection.provider_config_key
    });

    if (axios.isAxiosError(accountResponse) || !accountResponse || !accountResponse.data) {
        await nango.updateConnectionConfig({
            cloudId: site.id,
            baseUrl: site.url
        });
        return;
    }

    await nango.updateConnectionConfig({
        cloudId: site.id,
        baseUrl: site.url,
        accountId: accountResponse.data.accountId
    });
}
