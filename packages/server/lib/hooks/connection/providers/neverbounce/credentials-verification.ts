import type { InternalNango as Nango } from '../../credentials-verification-script.js';

export default async function execute(nango: Nango) {
    const { provider_config_key } = nango.getConnection();

    // GET /v4/account/info (Account Info) returns the account's credits and job counts; it is a read that uses no credits.
    // https://developers.neverbounce.com/v4.0/reference/account-info
    // NeverBounce returns API errors with a 200 and a `status` property in the body; `auth_failure` means the key was rejected:
    // https://developers.neverbounce.com/v4.0/reference/error-handling
    // Non-2xx answers and network errors are rethrown by the proxy as they are.
    const response = await nango.proxy({
        method: 'GET',
        endpoint: '/v4/account/info',
        providerConfigKey: provider_config_key
    });

    const { status, message } = parseBody(response);

    if (status === 'auth_failure') {
        throw new Error('Invalid credentials');
    }

    // other statuses (general_failure, temp_unavail, throttle_triggered, bad_referrer) do not prove the key is wrong
    if (status !== undefined && status !== 'success') {
        throw new Error(`NeverBounce returned status ${status}${message ? `: ${message}` : ''}`);
    }
}

function parseBody(response: unknown): { status: string | undefined; message: string | undefined } {
    if (typeof response !== 'object' || response === null || !('data' in response)) {
        return { status: undefined, message: undefined };
    }

    let data: unknown = response.data;
    // the body may arrive as text if it was not parsed
    if (typeof data === 'string') {
        try {
            data = JSON.parse(data);
        } catch {
            return { status: undefined, message: undefined };
        }
    }

    if (typeof data !== 'object' || data === null) {
        return { status: undefined, message: undefined };
    }

    const status = 'status' in data && typeof data.status === 'string' ? data.status : undefined;
    const message = 'message' in data && typeof data.message === 'string' ? data.message : undefined;
    return { status, message };
}
