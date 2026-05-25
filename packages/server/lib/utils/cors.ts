/**
 * Returns true if the given CORS origin should be allowed.
 *
 * Allows:
 *  - undefined (same-origin / server-to-server requests)
 *  - origins in the explicit allowlist
 *  - HTTPS PR-preview subdomains of the form `pr-<number>.<publicHost>`
 */
export function isAllowedWebCorsOrigin(origin: string | undefined, allowedOrigins: Set<string>, publicHost: string): boolean {
    if (!origin) return true;
    try {
        const url = new URL(origin);
        if (allowedOrigins.has(origin)) return true;
        // Only allow HTTPS with no non-standard port for PR preview subdomains
        return url.protocol === 'https:' && url.port === '' && /^pr-\d+\./.test(url.hostname) && url.hostname.endsWith(`.${publicHost}`);
    } catch {
        return false;
    }
}
