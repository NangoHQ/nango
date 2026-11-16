import type { InternalNango as Nango } from '../../credentials-verification-script.js';

export default async function execute(nango: Nango) {
    const { provider_config_key } = nango.getConnection();

    // GET /info returns the authenticated user's account info, and null (200) when the request is not authenticated
    // https://api.collegefootballdata.com/api/info#getuserinfo
    // A 401 means the request is not authorized: https://api.collegefootballdata.com/usage-and-access
    const response = await nango.proxy({
        method: 'GET',
        endpoint: '/info',
        providerConfigKey: provider_config_key
    });

    if (!hasAccountInfo(response)) {
        throw new Error('Invalid credentials');
    }
}

function hasAccountInfo(response: unknown): boolean {
    if (typeof response !== 'object' || response === null || !('data' in response)) {
        return false;
    }

    let data: unknown = response.data;
    // the body may arrive as text if it was not parsed
    if (typeof data === 'string') {
        try {
            data = JSON.parse(data);
        } catch {
            return false;
        }
    }

    return typeof data === 'object' && data !== null;
}
