import type { InternalNango as Nango } from '../../credentials-verification-script.js';

export default async function execute(nango: Nango) {
    const { provider_config_key } = nango.getConnection();

    await nango.proxy({
        endpoint: '/VersionInformation',
        providerConfigKey: provider_config_key
    });
}
