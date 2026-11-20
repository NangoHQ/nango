import type { InternalNango as Nango } from '../../credentials-verification-script.js';

// The Census Data API has no account endpoint and never answers a wrong key with a 4xx: it redirects (302) to an HTML
// "Invalid Key" page (or "Missing Key" when there is none), which answers 200. A valid key gets a JSON array of rows.
const KEY_ERROR_PAGES = ['/data/invalid_key.html', '/data/missing_key.html'];

export default async function execute(nango: Nango) {
    const { provider_config_key } = nango.getConnection();

    // GET /data/2014/pep/natstprc (2014 Population Estimates, national and state), Alabama only, reads public data
    // https://api.census.gov/data/2014/pep/natstprc.html
    // A request with a wrong key is sent to the Invalid Key page
    // https://api.census.gov/data/invalid_key.html
    let response: unknown;
    try {
        response = await nango.proxy({
            method: 'GET',
            endpoint: '/data/2014/pep/natstprc',
            params: { get: 'STNAME,POP', DATE_: '7', for: 'state:01' },
            providerConfigKey: provider_config_key
        });
    } catch (err) {
        // When the redirect is not followed, the 302 itself points to the key error page
        if (isKeyErrorRedirect(err)) {
            throw new Error('Invalid credentials');
        }
        throw err;
    }

    // Fail closed: only the documented JSON array of rows means the key was accepted
    if (isKeyErrorPage(response) || !isRowsResponse(response)) {
        throw new Error('Invalid credentials');
    }
}

function isRowsResponse(response: unknown): boolean {
    let data = field(response, 'data');
    // the body may arrive as text if it was not parsed
    if (typeof data === 'string') {
        try {
            data = JSON.parse(data);
        } catch {
            return false;
        }
    }
    return Array.isArray(data);
}

function field(value: unknown, key: string): unknown {
    return typeof value === 'object' && value !== null && key in value ? (value as Record<string, unknown>)[key] : undefined;
}

function pointsToKeyErrorPage(url: unknown): boolean {
    return typeof url === 'string' && KEY_ERROR_PAGES.some((page) => url.includes(page));
}

function isKeyErrorRedirect(err: unknown): boolean {
    const errResponse = field(err, 'response');
    const status = field(errResponse, 'status');
    if (typeof status !== 'number' || status < 300 || status >= 400) {
        return false;
    }
    const headers = field(errResponse, 'headers');
    return pointsToKeyErrorPage(field(headers, 'location'));
}

function isKeyErrorPage(response: unknown): boolean {
    // The URL the redirect ended on, when the HTTP client exposes it
    const finalUrl = field(field(field(response, 'request'), 'res'), 'responseUrl');
    if (pointsToKeyErrorPage(finalUrl)) {
        return true;
    }

    // Otherwise the body tells: the key error pages are HTML titled "Invalid Key" or "Missing Key"
    const data = field(response, 'data');
    return typeof data === 'string' && /<title>\s*(Invalid|Missing) Key\s*<\/title>/i.test(data);
}
