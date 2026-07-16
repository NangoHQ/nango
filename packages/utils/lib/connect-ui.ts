import { connectUrl } from './environment/detection.js';

/**
 * Connect UI is a prebuilt SPA with relative asset paths (vite base './'): they only resolve
 * when the document URL's path ends with '/'. NANGO_PUBLIC_CONNECT_URL may be configured with
 * or without one, so normalize before using it as a document URL.
 */
export function connectUrlAsDocumentBase(raw: string = connectUrl): URL {
    const url = new URL(raw);
    if (!url.pathname.endsWith('/')) {
        url.pathname += '/';
    }
    return url;
}

export function buildConnectUiSessionLink(token: string, raw: string = connectUrl): string {
    const url = connectUrlAsDocumentBase(raw);
    url.searchParams.set('session_token', token);
    return url.toString();
}
