import type { InternalNango as Nango } from '../../credentials-verification-script.js';

export default async function execute(nango: Nango) {
    const { credentials, provider_config_key } = nango.getConnection();
    const { apiKey } = credentials as { apiKey: string };

    try {
        await nango.proxy({
            method: 'POST',
            endpoint: '/subscriber/signin',
            providerConfigKey: provider_config_key,
            data: `apikey=${encodeURIComponent(apiKey)}`,
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });
    } catch {
        throw new Error('Invalid credentials');
    }
}
