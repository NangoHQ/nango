// Shared between the Vite build (vite.config.ts) and the startup rewrite (set-base-path.js).

// Connect UI is built with this placeholder as its base so a self-hoster can serve it under a
// non-root path without rebuilding: the container entrypoint rewrites the placeholder to the
// configured base path at startup. The value must be a valid base (leading + trailing slash) and
// unique enough to replace safely across built assets.
export const BASE_PATH_PLACEHOLDER = '/__NANGO_CONNECT_UI_BASE_PATH__/';

/**
 * The base path source: the path of NANGO_PUBLIC_CONNECT_URL (Connect UI's public URL already
 * includes any sub-path), or "/" (root, the default).
 * @param {Record<string, string | undefined>} env
 * @returns {string}
 */
function basePathSource(env) {
    if (env.NANGO_PUBLIC_CONNECT_URL) {
        try {
            return new URL(env.NANGO_PUBLIC_CONNECT_URL).pathname;
        } catch {
            // It's set but unparseable — fail loudly rather than silently serving from root.
            throw new Error(`Invalid NANGO_PUBLIC_CONNECT_URL "${env.NANGO_PUBLIC_CONNECT_URL}": not a valid URL`);
        }
    }
    return '/';
}

/**
 * Resolve the base path Connect UI is served under, normalized to a single leading and trailing
 * slash (e.g. "/" or "/nango/connect/").
 *
 * @param {Record<string, string | undefined>} env
 * @returns {string}
 */
export function resolveBasePath(env) {
    // Collapse into a single leading and trailing slash.
    const normalized = `/${basePathSource(env)}/`.replace(/\/+/g, '/');

    // The base path is written verbatim into the built HTML/CSS/JS. Reject anything outside a safe
    // URL-path character set so a malformed value fails loudly here instead of emitting broken —
    // or unsafe (e.g. HTML/JS metacharacters) — asset URLs.
    if (!/^\/[A-Za-z0-9._~:@%+/-]*$/.test(normalized)) {
        throw new Error(`Invalid Connect UI base path "${normalized}". Allowed characters: letters, digits, and -._~:@%+/`);
    }

    return normalized;
}
