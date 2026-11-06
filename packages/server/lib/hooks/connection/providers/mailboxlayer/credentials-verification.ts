import type { InternalNango as Nango } from '../../credentials-verification-script.js';

export default async function execute(nango: Nango) {
    const { provider_config_key } = nango.getConnection();

    // GET /check (validate a single email address); smtp=0 skips the SMTP check for a faster response
    // https://docs.apilayer.com/mailboxlayer/docs/api-documentation
    // A rejected key is answered with `{"success": false, "error": {"code": 101, "type": "invalid_access_key"}}` (101 missing_access_key, 102 inactive_user)
    // https://docs.apilayer.com/mailboxlayer/docs/getting-started
    const response = await nango.proxy({
        method: 'GET',
        endpoint: '/check',
        params: { email: 'support@apilayer.com', smtp: '0' },
        providerConfigKey: provider_config_key
    });

    if (isRejected(response)) {
        throw new Error('Invalid credentials');
    }
}

const REJECTED_KEY_CODES = [101, 102];

function isRejected(response: unknown): boolean {
    if (typeof response !== 'object' || response === null || !('data' in response)) {
        return true;
    }

    let data: unknown = response.data;
    // the body may arrive as text if it was not parsed
    if (typeof data === 'string') {
        try {
            data = JSON.parse(data);
        } catch {
            return true;
        }
    }

    if (typeof data !== 'object' || data === null) {
        return true;
    }

    // other errors (104 usage_limit_reached, 106 rate_limit_reached, 210/211 email errors, 310) mean the key was recognised
    if ('success' in data && data.success === false && 'error' in data && typeof data.error === 'object' && data.error !== null) {
        const code = 'code' in data.error ? Number(data.error.code) : NaN;
        return REJECTED_KEY_CODES.includes(code);
    }

    return false;
}
