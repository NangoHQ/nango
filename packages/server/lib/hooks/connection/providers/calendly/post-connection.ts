import type { InternalNango as Nango } from '../../post-connection.js';
import type { CalendlyUser } from './types.js';
import { isAxiosError } from 'axios';

export default async function execute(nango: Nango) {
    const connection = await nango.getConnection();

    const response = await nango.proxy<CalendlyUser>({
        endpoint: '/users/me',
        providerConfigKey: connection.provider_config_key
    });

    if (isAxiosError(response)) {
        return;
    }

    const { data } = response;

    const { current_organization } = data.resource;

    const organizationId = current_organization.split('/').pop();

    await nango.updateConnectionConfig({ organizationId });
}
