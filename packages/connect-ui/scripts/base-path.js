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
 * The normalization and safe-character contract here must stay in sync with the server-side session
 * link builder in packages/utils/lib/connect-ui.ts, so generated links and rewritten assets target
 * the same path. They can't share code: connect-ui doesn't depend on @nangohq/utils, and this runs
 * as a plain node script at container startup.
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
    // A base path is only a pathname; drop any query/fragment if one was passed by mistake.
    raw = raw.split(/[?#]/)[0];
    // Collapse into a single leading and trailing slash regardless of how it was provided.
    const normalized = `/${raw}/`.replace(/\/+/g, '/');

    // The base path is written verbatim into the built HTML/CSS/JS. Reject anything outside a safe
    // URL-path character set so a malformed value fails loudly here instead of emitting broken —
    // or unsafe (e.g. HTML/JS metacharacters) — asset URLs.
    if (!/^\/[A-Za-z0-9._~:@%+/-]*$/.test(normalized)) {
        throw new Error(`Invalid Connect UI base path "${normalized}". Allowed characters: letters, digits, and -._~:@%+/`);
    }

    return normalized;
}
