import type { InternalNango as Nango } from '../../post-connection.js';

export default async function execute(nango: Nango) {
    const connection = await nango.getConnection();
    await nango.proxy({
        method: 'POST',
        // This endpoint can be hit to mark your app as installed in Rippling
        // https://developer.rippling.com/documentation/base-api/reference/post-mark-app-installed
        endpoint: '/platform/api/mark_app_installed',
        providerConfigKey: connection.provider_config_key
    });
}
