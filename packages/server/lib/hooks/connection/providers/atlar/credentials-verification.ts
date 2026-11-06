import type { InternalNango as Nango } from '../../credentials-verification-script.js';

export default async function execute(nango: Nango) {
    const { provider_config_key } = nango.getConnection();

    // Resource endpoints answer 403 when the programmatic access user's role lacks a permission, so they cannot verify every valid key.
    // POST /iam/v2/oauth2/token (Create OAuth 2.0 access token) accepts the access key and secret as HTTP Basic auth whatever the role,
    // returns an `access_token` on success and 401 `invalid_client` ("Client authentication failed.") for a wrong key (proxy throws).
    // It only issues a short-lived token and changes no data.
    // https://docs.atlar.com/reference/post_iam-v2-oauth2-token
    const response = await nango.proxy({
        method: 'POST',
        endpoint: '/iam/v2/oauth2/token',
        providerConfigKey: provider_config_key,
        data: 'grant_type=client_credentials',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        }
    });

    if (!hasAccessToken(response)) {
        throw new Error('Invalid credentials');
    }
}

function hasAccessToken(response: unknown): boolean {
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

    return typeof data === 'object' && data !== null && 'access_token' in data && typeof data.access_token === 'string' && data.access_token.length > 0;
}
