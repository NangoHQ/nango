import type { InternalNango as Nango } from './post-connection.js';
import type { FullAccount } from '../response-types/dropbox.js';
import { isAxiosError } from 'axios';

export default async function execute(nango: Nango) {
    const connection = await nango.getConnection();

    const response = await nango.proxy<FullAccount>({
        method: 'POST',
        endpoint: '/2/users/get_current_account',
        headers: {
            'Content-Type': 'application/json'
        },
        providerConfigKey: connection.provider_config_key,
        data: null
    });

    if (isAxiosError(response)) {
        return;
    }

    const { data } = response;

    const { account_id } = data;

    await nango.updateConnectionConfig({ account_id });
}
