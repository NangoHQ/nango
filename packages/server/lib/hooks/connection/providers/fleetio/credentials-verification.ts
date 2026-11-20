import type { InternalNango as Nango } from '../../credentials-verification-script.js';

const MAX_PAGES = 5;

export default async function execute(nango: Nango) {
    const { provider_config_key, credentials } = nango.getConnection();
    const accountToken = 'password' in credentials && typeof credentials.password === 'string' ? credentials.password.trim() : '';
    if (!accountToken) {
        throw new Error('Invalid credentials');
    }

    // List Accounts checks the API key but ignores the Account-Token header, so the script checks the
    // Account Token itself: it must be the `token` (URL token) of one of the accounts the key reaches.
    // GET /v1/accounts (List Accounts): https://developer.fleetio.com/docs/api/accounts-index
    // An invalid API key gets 401 Unauthorized: https://developer.fleetio.com/docs/overview/response-codes
    let startCursor: string | undefined;
    for (let page = 0; page < MAX_PAGES; page++) {
        let data: unknown;
        try {
            const response = await nango.proxy({
                method: 'GET',
                endpoint: '/v1/accounts',
                params: {
                    per_page: 100,
                    ...(startCursor ? { start_cursor: startCursor } : {})
                },
                providerConfigKey: provider_config_key
            });
            data = 'data' in response ? response.data : undefined;
        } catch (err) {
            if (readStatus(err) === 401) {
                throw new Error('Invalid credentials');
            }
            throw err;
        }

        const body = parse(data);
        if (!body) {
            throw new Error('Unexpected response from Fleetio List Accounts');
        }

        if (body.records.some((record) => record.token === accountToken)) {
            return;
        }

        if (!body.next_cursor) {
            break;
        }
        startCursor = body.next_cursor;
    }

    // The API key is valid but none of its accounts has this Account Token
    throw new Error('Invalid credentials');
}

function readStatus(err: unknown): number | undefined {
    if (typeof err !== 'object' || err === null || !('response' in err) || typeof err.response !== 'object' || err.response === null) {
        return undefined;
    }
    const response = err.response;
    return 'status' in response && typeof response.status === 'number' ? response.status : undefined;
}

function parse(raw: unknown): { records: { token?: unknown }[]; next_cursor: string | null } | null {
    let data: unknown = raw;
    // the body may arrive as text if it was not parsed
    if (typeof data === 'string') {
        try {
            data = JSON.parse(data);
        } catch {
            return null;
        }
    }

    if (typeof data !== 'object' || data === null || !('records' in data) || !Array.isArray(data.records)) {
        return null;
    }

    const records = data.records.filter((record): record is { token?: unknown } => typeof record === 'object' && record !== null);
    const nextCursor = 'next_cursor' in data && typeof data.next_cursor === 'string' && data.next_cursor ? data.next_cursor : null;
    return { records, next_cursor: nextCursor };
}
