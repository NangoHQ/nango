import type { InternalNango as Nango } from '../../credentials-verification-script.js';

export default async function execute(nango: Nango) {
    const { provider_config_key } = nango.getConnection();

    const response = await nango.proxy({
        endpoint: '/_apis/projects',
        providerConfigKey: provider_config_key
    });

    if (response.status !== 200) {
        throw new Error('Incorrect Credentials');
    }
}
