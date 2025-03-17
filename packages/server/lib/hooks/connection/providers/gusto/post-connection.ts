import type { InternalNango as Nango } from '../../post-connection.js';
import type { GustoTokenInfoResponse } from './types.js';
import { isAxiosError } from 'axios';

export default async function execute(nango: Nango) {
    const connection = await nango.getConnection();
    const rootUrl = connection.provider_config_key.includes('sandbox') ? 'api.gusto-demo.com' : 'api.gusto.com';

    const response = await nango.proxy<GustoTokenInfoResponse>({
        baseUrlOverride: `https://${rootUrl}`,
        endpoint: '/v1/token_info',
        providerConfigKey: connection.provider_config_key
    });

    if (isAxiosError(response)) {
        return;
    }

    const { data } = response;

    const { resource } = data;

    if (resource.type === 'Company') {
        const { uuid } = resource;
        await nango.updateConnectionConfig({ companyUuid: uuid });
    }
}
