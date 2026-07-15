const DEFAULT_CONNECT_URL = 'http://localhost:3009';

function normalizeConnectUiBasePath(raw: string): string {
    const path = raw.split(/[?#]/)[0] || '/';
    const normalized = `/${path}/`.replace(/\/+/g, '/');

    if (!/^\/[A-Za-z0-9._~:@%+/-]*$/.test(normalized)) {
        throw new Error(`Invalid Connect UI base path "${normalized}". Allowed characters: letters, digits, and -._~:@%+/`);
    }

    return normalized;
}

export function resolveConnectUiUrl(env: Record<string, string | undefined> = process.env): URL {
    const url = new URL(env['NANGO_PUBLIC_CONNECT_URL'] || DEFAULT_CONNECT_URL);

    if (env['NANGO_CONNECT_UI_BASE_PATH']) {
        url.pathname = normalizeConnectUiBasePath(env['NANGO_CONNECT_UI_BASE_PATH']);
    }

    return url;
}

export function buildConnectUiSessionLink(token: string, env: Record<string, string | undefined> = process.env): string {
    const url = resolveConnectUiUrl(env);
    url.searchParams.set('session_token', token);
    return url.toString();
}
