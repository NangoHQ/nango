import type { InternalNango as Nango } from '../pre-connection-delete.js';

export default async function execute(nango: Nango) {
    const connection = await nango.getConnection();

    await nango.proxy({
        method: 'POST',
        endpoint: '/auth/uninstall',
        providerConfigKey: connection.provider_config_key
    });
}

