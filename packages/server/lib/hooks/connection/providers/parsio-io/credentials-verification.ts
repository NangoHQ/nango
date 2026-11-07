import type { InternalNango as Nango } from '../../credentials-verification-script.js';

export default async function execute(nango: Nango) {
    const { provider_config_key } = nango.getConnection();

    // GET /mailboxes ("List mailboxes") returns the array of mailboxes available to the authenticated user
    // https://help.parsio.io/public-api/parsio-public-api#:~:text=List%20mailboxes
    // Unauthenticated requests are answered with 401 Unauthorized (proxy throws); any 2xx body that is not a mailbox list is treated as invalid
    // https://help.parsio.io/public-api/parsio-public-api#:~:text=Unauthenticated%20responses%20return
    const response = await nango.proxy({
        method: 'GET',
        endpoint: '/mailboxes',
        providerConfigKey: provider_config_key
    });

    if (!isMailboxList(response)) {
        throw new Error('Invalid credentials');
    }
}

function isMailboxList(response: unknown): boolean {
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

    return Array.isArray(data);
}
