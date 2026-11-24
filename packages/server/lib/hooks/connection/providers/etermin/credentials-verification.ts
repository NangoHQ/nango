import type { InternalNango as Nango } from '../../credentials-verification-script.js';

// eTermin signs every request: a new random salt, and signature = base64 of the raw HMAC-SHA256 of the salt keyed with the secret key.
// Nango's header templates can only produce hex HMACs, so the script signs the verification request itself.
export default async function execute(nango: Nango) {
    const { credentials, provider_config_key } = nango.getConnection();
    const { password } = credentials as { username: string; password: string };

    const salt = crypto.randomUUID();
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey('raw', encoder.encode(password), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const signature = Buffer.from(await crypto.subtle.sign('HMAC', key, encoder.encode(salt))).toString('base64');

    // GET /api/calendar ("Get calendar details") returns the account's calendars and takes no required parameters
    // https://app.swaggerhub.com/apis-docs/etermin.net/eTermin-API/1.0.0#/Calendar/get_api_calendar
    // The publickey, salt and signature headers and how to sign the salt:
    // https://www.etermin.net/online-terminplaner-api
    // A wrong key pair gets a 400 whose body says "Wrong authorization!" (not documented, observed on the live API).
    // Other errors (rate limits, outages, network errors) are rethrown as they are.
    try {
        await nango.proxy({
            method: 'GET',
            endpoint: '/calendar',
            providerConfigKey: provider_config_key,
            headers: { salt, signature }
        });
    } catch (err) {
        const response = errorResponse(err);
        if (
            response &&
            (response.status === 400 || response.status === 401 || response.status === 403) &&
            bodyText(response.data).includes('Wrong authorization')
        ) {
            throw new Error('Invalid credentials');
        }
        throw err;
    }
}

function errorResponse(err: unknown): { status: number; data: unknown } | undefined {
    if (typeof err !== 'object' || err === null || !('response' in err) || typeof err.response !== 'object' || err.response === null) {
        return undefined;
    }
    const response = err.response;
    if (!('status' in response) || typeof response.status !== 'number') {
        return undefined;
    }
    return { status: response.status, data: 'data' in response ? response.data : undefined };
}

// the error body is XML sent as application/json, so it may arrive as text or as a parsed value
function bodyText(data: unknown): string {
    if (typeof data === 'string') {
        return data;
    }
    if (data === undefined || data === null) {
        return '';
    }
    try {
        return JSON.stringify(data);
    } catch {
        return '';
    }
}
