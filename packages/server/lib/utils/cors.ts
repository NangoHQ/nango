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
    if (allowedOrigins.has(origin)) return true;
    try {
        const url = new URL(origin);
        // Only allow HTTPS, default port, and exact pr-<number>.<publicHost> (no extra labels)
        const escapedHost = publicHost.replace(/\./g, '\\.');
        return url.protocol === 'https:' && url.port === '' && new RegExp(`^pr-\\d+\\.${escapedHost}$`).test(url.hostname);
    } catch {
        return false;
    }
}
