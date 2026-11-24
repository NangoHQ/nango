import type { InternalNango as Nango } from '../../internal-nango.js';
import type { AdobeAnalyticsDiscoveryResponse } from './types.js';

export default async function execute(nango: Nango) {
    const connection = await nango.getConnection();

    if (connection.connection_config['globalCompanyId']) {
        return;
    }

    // The proxy throws on a failed request, so a missing scope or Adobe error doesn't fail the connection.
    let response;
    try {
        response = await nango.proxy<AdobeAnalyticsDiscoveryResponse>({
            endpoint: '/discovery/me',
            providerConfigKey: connection.provider_config_key
        });
    } catch {
        return;
    }

    if (!('data' in response)) {
        return;
    }

    const globalCompanyId = response.data.imsOrgs?.[0]?.companies?.[0]?.globalCompanyId;

    if (globalCompanyId) {
        await nango.updateConnectionConfig({ globalCompanyId });
    }
}
