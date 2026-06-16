import { basePublicUrl, baseUrl, isLocal } from '@nangohq/utils';

const allowedOrigins = new Set([basePublicUrl, baseUrl]);
const publicHost = new URL(basePublicUrl).hostname;

/**
 * Returns true if the given CORS origin should be allowed.
 *
 * Allows:
 *  - undefined (same-origin / server-to-server requests)
 *  - origins in the explicit allowlist (basePublicUrl, baseUrl)
 *  - in local dev only: any http loopback origin (localhost / 127.0.0.1 / [::1]) on any port,
 *    so dashboards on auto-incremented Vite ports (3000, 3001, ... across worktrees)
 *    can call the API directly without a proxy
 *  - HTTPS PR-preview subdomains of the form `pr-<number>.<publicHost>`
 */
export function isAllowedWebCorsOrigin(origin: string | undefined): boolean {
    if (!origin) return true;
    if (allowedOrigins.has(origin)) return true;
    try {
        const url = new URL(origin);
        // Local dev: trust any localhost port (gated to isLocal, never cloud/enterprise/docker/hosted)
        if (isLocal && url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]')) {
            return true;
        }
        // Only allow HTTPS, default port, and exact pr-<number>.<publicHost> (no extra labels)
        const escapedHost = publicHost.replace(/\./g, '\\.');
        return url.protocol === 'https:' && url.port === '' && new RegExp(`^pr-\\d+\\.${escapedHost}$`).test(url.hostname);
    } catch {
        return false;
    }
}
