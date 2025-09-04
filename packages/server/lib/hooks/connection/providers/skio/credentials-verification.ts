import type { Error, OrdersResponse } from './types.js';
import type { InternalNango as Nango } from '../../credentials-verification-script.js';

export default async function execute(nango: Nango) {
    const { provider_config_key } = nango.getConnection();

    const response = await nango.proxy<OrdersResponse | Error>({
        method: 'POST',
        endpoint: '/v1/graphql',
        providerConfigKey: provider_config_key,
        data: {
            query: `query Orders {
                Orders {
                  id
                }
              }`
        }
    });

    if ('data' in response && !isValidResponse(response.data)) {
        throw new Error('Incorrect Credentials');
    }
}

function isValidResponse(response: unknown): response is OrdersResponse {
    return typeof response === 'object' && response !== null && 'data' in response && Array.isArray((response as OrdersResponse).data?.Orders);
}
