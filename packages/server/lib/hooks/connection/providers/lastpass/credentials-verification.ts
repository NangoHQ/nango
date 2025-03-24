import type { InternalNango as Nango } from '../../credentials-verification-script.js';
import type { UserResponse } from './types.js';

export default async function execute(nango: Nango) {
    const { credentials, provider_config_key } = nango.getConnection();

    const { username, password } = credentials as { username: string; password: string };

    const response = await nango.proxy<UserResponse | string>({
        method: 'POST',
        endpoint: '/enterpriseapi.php',
        providerConfigKey: provider_config_key,
        data: {
            cid: username,
            provhash: password,
            cmd: 'getuserdata'
        }
    });

    if (isAuthorizationError(response)) {
        throw new Error('Incorrect Credentials');
    }
}

function isAuthorizationError(response: unknown): boolean {
    return (
        typeof response === 'object' &&
        response !== null &&
        'data' in response &&
        typeof response.data === 'string' &&
        response.data.includes('Authorization Error')
    );
}
