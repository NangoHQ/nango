import type { InternalNango as Nango } from '../../credentials-verification-script.js';

/**
 * CartRover returns HTTP 200 with `success_code: false` for invalid credentials,
 * so a status-only check would accept any keys.
 * `/v1/wms/shipmethod/list` is available to Cart, Merchant, and Warehouse API keys.
 */
export default async function execute(nango: Nango) {
    const { provider_config_key } = nango.getConnection();

    const response = await nango.proxy<{ success_code?: boolean; message?: string }>({
        method: 'GET',
        endpoint: '/v1/wms/shipmethod/list',
        providerConfigKey: provider_config_key
    });

    if (!('data' in response) || !response.data || response.data.success_code !== true) {
        throw new Error('Invalid credentials');
    }
}
