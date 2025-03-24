import type { APIDetailsResponse } from './types.js';
import type { InternalNango as Nango } from '../../credentials-verification-script.js';

export default async function execute(nango: Nango) {
    const { provider_config_key: providerConfigKey } = nango.getConnection();

    const bitInput = {
        jsonrpc: '2.0',
        method: 'getApiKeyDetails',
        params: {},
        id: Math.floor(Math.random() * 1000000)
    };

    await nango.proxy<APIDetailsResponse>({
        method: 'POST',
        // https://www.bitdefender.com/business/support/en/77209-140282-getapikeydetails.html
        endpoint: '/v1.0/jsonrpc/general',
        providerConfigKey,
        data: bitInput
    });
}
