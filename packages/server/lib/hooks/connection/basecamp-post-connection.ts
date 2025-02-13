import type { InternalNango as Nango } from './post-connection.js';
import type { BasecampAuthorizationResponse } from '../response-types/basecamp.js';
import { isAxiosError } from 'axios';

export default async function execute(nango: Nango) {
    const connection = await nango.getConnection();

    const response = await nango.proxy<BasecampAuthorizationResponse>({
        baseUrlOverride: 'https://launchpad.37signals.com',
        endpoint: '/authorization.json',
        connectionId: connection.connection_id,
        providerConfigKey: connection.provider_config_key
    });

    if (isAxiosError(response)) {
        return;
    }

    const { data } = response;

    const { accounts } = data;

    await nango.updateConnectionConfig({ accounts });
}
