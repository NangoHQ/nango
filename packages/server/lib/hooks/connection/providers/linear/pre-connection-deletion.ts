import { isAxiosError } from 'axios';

import type { LinearTokenRevokeResponse } from './types.js';
import type { InternalNango } from '../../internal-nango.js';

export default async function execute(nango: InternalNango) {
    try {
        const connection = await nango.getConnection();
        await nango.proxy<LinearTokenRevokeResponse>({
            method: 'POST',
            // https://linear.app/developers/oauth-2-0-authentication#revoke-an-access-token
            endpoint: '/oauth/revoke',
            providerConfigKey: connection.provider_config_key
        });

        return;
    } catch (err) {
        if (isAxiosError(err)) {
            const linearError = err.response?.data?.error || err;
            throw new Error(`Error revoking Linear token: ${linearError}`);
        }
        throw err;
    }
}
