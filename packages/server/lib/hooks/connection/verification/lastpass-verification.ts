import type { InternalNango as Nango } from '../verificatiion-script.js';
import type { UserResponse } from '../../response-types/lastpass.js';

export default async function execute(nango: Nango) {
    const { credentials, providerConfigKey } = await nango.getCredentials();

    if (!isValidCredentials(credentials)) {
        throw new Error('Invalid credentials format');
    }

    const { username, password } = credentials;

    const response = await nango.proxy<UserResponse | string>({
        method: 'POST',
        endpoint: '/enterpriseapi.php',
        providerConfigKey,
        data: {
            cid: username,
            provhash: password,
            cmd: 'getuserdata'
        }
    });

    if (isAuthorizationError(response)) {
        throw new Error('Authorization Error');
    }
}

function isValidCredentials(credentials: unknown): credentials is { username: string; password: string } {
    return typeof credentials === 'object' && credentials !== null && 'username' in credentials && 'password' in credentials;
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
