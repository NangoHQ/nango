import type { InternalNango as Nango } from '../../credentials-verification-script.js';

export default async function execute(nango: Nango) {
    const { provider_config_key } = nango.getConnection();
    const { custom } = nango.getIntegrationConfig();
    const endpoint = custom?.['generic_api_key_verification_endpoint'];

    if (!endpoint) {
        return;
    }

    await nango.proxy({
        endpoint,
        method: custom?.['generic_api_key_verification_method'] === 'POST' ? 'POST' : 'GET',
        providerConfigKey: provider_config_key
    });
}
