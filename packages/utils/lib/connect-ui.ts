const DEFAULT_CONNECT_URL = 'http://localhost:3009';

// Normalize the base path to a single leading and trailing slash. The character set is validated at
// startup by the ENVS schema (NANGO_CONNECT_UI_BASE_PATH), so it is not re-checked here.
//
// This must stay in sync with the asset rewrite in packages/connect-ui/scripts/base-path.js, which
// applies the same base path to the built assets — otherwise session links and assets could target
// different paths. They can't share code: connect-ui does not depend on @nangohq/utils, and that
// script runs as plain node at container startup.
function normalizeConnectUiBasePath(basePath: string): string {
    return `/${basePath}/`.replace(/\/+/g, '/');
}

export function resolveConnectUiUrl({ connectUrl, basePath }: { connectUrl?: string | undefined; basePath?: string | undefined }): URL {
    const url = new URL(connectUrl || DEFAULT_CONNECT_URL);

    if (basePath) {
        url.pathname = normalizeConnectUiBasePath(basePath);
    }

    return url;
}

export function buildConnectUiSessionLink(token: string, { connectUrl, basePath }: { connectUrl?: string | undefined; basePath?: string | undefined }): string {
    const url = resolveConnectUiUrl({ connectUrl, basePath });
    url.searchParams.set('session_token', token);
    return url.toString();
}
