import type { InternalNango as Nango } from './connection.manager.js';

export default async function execute(nango: Nango) {
    const response = await nango.proxy({
        endpoint: `oauth/token/accessible-resources`
    });

    if (!response || !response.data || response.data.length === 0 || !response.data[0].id) {
        return;
    }

    const cloudId = response.data[0].id;

    const accountResponse = await nango.proxy({
        endpoint: `ex/jira/${cloudId}/rest/api/3/myself`
    });

    if (!accountResponse || !accountResponse.data || accountResponse.data.length === 0) {
        await nango.updateConnectionConfig({ cloudId });
        return;
    }

    const { accountId } = accountResponse.data;

    await nango.updateConnectionConfig({ cloudId, accountId });
}
