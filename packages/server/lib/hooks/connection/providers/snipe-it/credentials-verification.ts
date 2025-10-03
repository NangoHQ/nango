import type { InternalNango as Nango } from '../../credentials-verification-script.js';

export default async function execute(nango: Nango) {
    const { provider_config_key } = nango.getConnection();

    try {
        await nango.proxy({
            endpoint: '/api/v1/users',
            providerConfigKey: provider_config_key
        });
    } catch {
        throw new Error('Invalid credentials');
    }
}
