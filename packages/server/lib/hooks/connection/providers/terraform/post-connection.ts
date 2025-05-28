import type { InternalNango as Nango } from '../../post-connection.js';
import { isAxiosError } from 'axios';
import type { TerraformOrganizationsResponse } from './types.js';

export default async function execute(nango: Nango) {
    const connection = await nango.getConnection();

    // rely on the customer provided organizationId if possible
    if (connection.connection_config?.['organizationId']) {
        return;
    }

    const response = await nango.proxy<TerraformOrganizationsResponse>({
        baseUrlOverride: 'https://app.terraform.io',
        endpoint: '/api/v2/organizations',
        method: 'GET',
        providerConfigKey: connection.provider_config_key
    });

    if (isAxiosError(response) || !response || !response.data) {
        throw new Error('Failed to retrieve Terraform organization');
    }

    const organizationId = response.data?.data?.[0]?.id;

    await nango.updateConnectionConfig({ organizationId });
}
