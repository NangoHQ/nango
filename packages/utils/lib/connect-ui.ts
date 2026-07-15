const DEFAULT_CONNECT_URL = 'http://localhost:3009';

// Build the shareable Connect UI session link. NANGO_PUBLIC_CONNECT_URL already includes any base
// path Connect UI is served under (the frontend SDK loads the iframe from it), so the link is just
// that URL plus the session token.
export function buildConnectUiSessionLink(token: string, connectUrl?: string): string {
    const url = new URL(connectUrl || DEFAULT_CONNECT_URL);
    url.searchParams.set('session_token', token);
    return url.toString();
}
