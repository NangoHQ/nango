import type { InternalNango as Nango } from './connection.manager.js';
import axios from 'axios';

export default async function execute(nango: Nango) {
    const connection = await nango.getConnection();
    const response = await nango.proxy({
        endpoint: `oauth/token/accessible-resources`,
        connectionId: connection.connection_id,
        providerConfigKey: connection.provider_config_key
    });

    if (axios.isAxiosError(response) || !response || !response.data || response.data.length === 0 || !response.data[0].id) {
        return;
    }

    const cloudId = response.data[0].id;

    const accountResponse = await nango.proxy({
        endpoint: `ex/jira/${cloudId}/rest/api/3/myself`,
        connectionId: connection.connection_id,
        providerConfigKey: connection.provider_config_key
    });

    if (axios.isAxiosError(accountResponse) || !accountResponse || !accountResponse.data || accountResponse.data.length === 0) {
        await nango.updateConnectionConfig({ cloudId });
        return;
    }

    const { accountId } = accountResponse.data;

    await nango.updateConnectionConfig({ cloudId, accountId });
}
