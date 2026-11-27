import type { InternalNango as Nango } from '../../credentials-verification-script.js';

// MailboxValidator has no identity or account endpoint, so the key is checked on the validation endpoint,
// which needs an email address. It checks the key before the email, so a placeholder address is enough.
export default async function execute(nango: Nango) {
    const { provider_config_key } = nango.getConnection();

    // GET /v2/validation/single (Single Email Validation API); its error codes are documented on the same page:
    // 401 with error_code 10001 (API key not found), 10002 (API key disabled) or 10003 (API key expired) means the key is rejected.
    // 401 with 10004 (Insufficient credits) means the key is valid but out of credits.
    // https://www.mailboxvalidator.com/api-single-validation
    // Other errors (400, 500, network errors) are rethrown as they are.
    try {
        await nango.proxy({
            method: 'GET',
            endpoint: '/v2/validation/single',
            params: { email: 'test@example.com' },
            providerConfigKey: provider_config_key
        });
    } catch (err) {
        const { status, errorCode } = errorDetails(err);
        if (status === 401 && errorCode !== undefined && INVALID_KEY_CODES.includes(errorCode)) {
            throw new Error('Invalid credentials');
        }
        if (status === 401 && errorCode === INSUFFICIENT_CREDITS_CODE) {
            return;
        }
        throw err;
    }
}

const INVALID_KEY_CODES = [10001, 10002, 10003];
const INSUFFICIENT_CREDITS_CODE = 10004;

function errorDetails(err: unknown): { status: number | undefined; errorCode: number | undefined } {
    if (typeof err !== 'object' || err === null || !('response' in err) || typeof err.response !== 'object' || err.response === null) {
        return { status: undefined, errorCode: undefined };
    }
    const response = err.response;
    const status = 'status' in response && typeof response.status === 'number' ? response.status : undefined;

    let data: unknown = 'data' in response ? response.data : undefined;
    // the body may come back as text when it was not parsed as JSON
    if (typeof data === 'string') {
        try {
            data = JSON.parse(data);
        } catch {
            return { status, errorCode: undefined };
        }
    }

    if (typeof data !== 'object' || data === null || !('error' in data) || typeof data.error !== 'object' || data.error === null) {
        return { status, errorCode: undefined };
    }
    const error = data.error;
    // error_code is documented as an integer; accept a numeric string too
    const code = 'error_code' in error ? Number(error.error_code) : NaN;
    return { status, errorCode: Number.isNaN(code) ? undefined : code };
}
