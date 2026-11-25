import type { InternalNango as Nango } from '../../credentials-verification-script.js';

export default async function execute(nango: Nango) {
    const { provider_config_key } = nango.getConnection();

    // GET /v5/account (Account) returns the workspace `uid`, its quota and the calling key's `api_key` details; it needs no resource scope
    // https://developers.bannerbear.com/v5/#account
    // A wrong key is answered with 401 Unauthorized (proxy throws)
    // https://developers.bannerbear.com/v5/#errors
    const response = await nango.proxy({
        method: 'GET',
        endpoint: '/v5/account',
        providerConfigKey: provider_config_key
    });

    if (!isAccount(response)) {
        throw new Error('Invalid credentials');
    }
}

function isAccount(response: unknown): boolean {
    if (typeof response !== 'object' || response === null || !('status' in response) || !('data' in response)) {
        return false;
    }

    if (typeof response.status !== 'number' || response.status < 200 || response.status >= 300) {
        return false;
    }

    let data: unknown = response.data;
    // the body may come back as text when the content type is not JSON
    if (typeof data === 'string') {
        try {
            data = JSON.parse(data);
        } catch {
            return false;
        }
    }

    if (typeof data !== 'object' || data === null || ('message' in data && data.message != null)) {
        return false;
    }

    return (
        'uid' in data && typeof data.uid === 'string' && data.uid.length > 0 && 'api_key' in data && typeof data.api_key === 'object' && data.api_key !== null
    );
}
