import type { InternalNango as Nango } from '../../post-connection.js';
import { isAxiosError } from 'axios';

export default async function execute(nango: Nango) {
    const connection = await nango.getConnection();
    let access_token: string;
    if ('access_token' in connection.credentials) {
        access_token = connection.credentials.access_token;
    } else {
        return;
    }

    const response = await nango.proxy({
        endpoint: '/v1/nodes',
        params: {
            page: 1,
            per_page: 1
        },
        headers: {
            Authorization: 'Basic ' + Buffer.from(access_token + ':').toString('base64')
        },
        providerConfigKey: connection.provider_config_key
    });

    if (isAxiosError(response)) {
        await nango.updateConnectionConfig({ accountHierarchyEnabled: false });
        return;
    }

    await nango.updateConnectionConfig({ accountHierarchyEnabled: true });
}
