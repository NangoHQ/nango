// Shared between the Vite build (vite.config.ts) and the startup rewrite (set-base-path.js).

// Connect UI is built with this placeholder as its base so a self-hoster can serve it under a
// non-root path without rebuilding: the container entrypoint rewrites the placeholder to the
// configured base path at startup. The value must be a valid base (leading + trailing slash) and
// unique enough to replace safely across built assets.
export const BASE_PATH_PLACEHOLDER = '/__NANGO_CONNECT_UI_BASE_PATH__/';

/**
 * Resolve the base path Connect UI is served under, normalized to a single leading and trailing
 * slash (e.g. "/" or "/nango/connect/").
 *
 * Precedence:
 *   1. NANGO_CONNECT_UI_BASE_PATH (explicit override)
 *   2. the path of NANGO_PUBLIC_CONNECT_URL (the public URL already set for Connect UI)
 *   3. "/" (root, the default — unchanged behavior)
 *
 * @param {Record<string, string | undefined>} env
 * @returns {string}
 */
export function resolveBasePath(env) {
    let raw = env.NANGO_CONNECT_UI_BASE_PATH;
    if (!raw && env.NANGO_PUBLIC_CONNECT_URL) {
        try {
            raw = new URL(env.NANGO_PUBLIC_CONNECT_URL).pathname;
        } catch {
            raw = '/';
        }
    }
    if (!raw) {
        raw = '/';
    }
    // Collapse into a single leading and trailing slash regardless of how it was provided.
    return `/${raw}/`.replace(/\/+/g, '/');
}
