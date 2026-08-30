import { isAxiosError } from 'axios';

import type { InternalNango as Nango } from '../../credentials-verification-script.js';

// CDW's only currently subscribable operation is order creation, so there is no safe
// read-only endpoint to verify credentials against without risking a real order.
// Instead, we send an empty payload: an invalid/missing subscription key is rejected by
// the gateway with 401 before the request body is looked at, while a valid key reaches
// CDW's schema validation, which rejects the empty body with 400. That distinction is
// enough to confirm the subscription key is valid without creating anything.
export default async function execute(nango: Nango) {
    const { provider_config_key } = nango.getConnection();

    try {
        await nango.proxy({
            endpoint: '/v1/customers/orders',
            method: 'POST',
            data: {},
            providerConfigKey: provider_config_key
        });
    } catch (err) {
        if (isAxiosError(err) && err.response?.status === 400) {
            return;
        }

        throw new Error('Invalid CDW subscription key');
    }
}
