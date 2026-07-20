import axios from 'axios';

import type { InternalNango as Nango } from '../../internal-nango.js';

export default async function execute(nango: Nango) {
    const query = `
        query {
            account {
                id
            }
        }`;

    const connection = await nango.getConnection();
    const response = await nango.proxy({
        endpoint: '/graphql',
        data: { query },
        method: 'POST',
        providerConfigKey: connection.provider_config_key
    });

    if (axios.isAxiosError(response) || !response || !response.data || !response.data.data?.account?.id) {
        return;
    }

    const globalId = Buffer.from(response.data.data.account.id, 'base64').toString('utf-8');
    const numericId = globalId.split('/').pop();

    if (!numericId || !/^\d+$/.test(numericId)) {
        return;
    }

    const accountId = Buffer.from(numericId, 'utf-8').toString('base64');

    await nango.updateConnectionConfig({ accountId });
}
