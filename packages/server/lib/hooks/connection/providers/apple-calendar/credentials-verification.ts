import { isAxiosError } from 'axios';

import type { InternalNango as Nango } from '../../credentials-verification-script.js';

export default async function execute(nango: Nango) {
    const { provider_config_key } = nango.getConnection();

    const response = await nango.proxy<string>({
        method: 'PROPFIND',
        endpoint: '/',
        providerConfigKey: provider_config_key,
        headers: {
            depth: '0',
            'content-type': 'application/xml; charset=utf-8'
        },
        data: '<propfind xmlns="DAV:"><prop><current-user-principal/></prop></propfind>'
    });

    if (isAxiosError(response) || response.status !== 207 || typeof response.data !== 'string' || !response.data.includes('current-user-principal')) {
        throw new Error('Incorrect Credentials');
    }
}
