import type { InternalNango as Nango } from '../../post-connection.js';
import type { BasecampAuthorizationResponse } from './types.js';
import { isAxiosError } from 'axios';

export default async function execute(nango: Nango) {
    const connection = await nango.getConnection();

    const response = await nango.proxy<BasecampAuthorizationResponse>({
        baseUrlOverride: 'https://launchpad.37signals.com',
        endpoint: '/authorization.json',
        providerConfigKey: connection.provider_config_key
    });

    if (isAxiosError(response)) {
        return;
    }

    const { data } = response;

    const { accounts } = data;

    const hasAccountId = connection.connection_config['accountId'];

    // if the user didn't set the optional accountId only has one then set it automatically for them
    if (!hasAccountId && accounts && accounts.length === 1 && accounts[0] && accounts[0].id) {
        await nango.updateConnectionConfig({ accounts, accountId: accounts[0].id });
    } else {
        await nango.updateConnectionConfig({ accounts });
    }
}
