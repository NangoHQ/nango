// Reserved TLD (RFC 2606) used only to resolve relative paths; a returnTo that escapes this origin is rejected.
const RETURN_TO_BASE_ORIGIN = 'https://internal.invalid';

/** Only the server-created, opaque OAuth continuation survives login session rotation. */
export function safeOAuthContinuation(value: string | undefined): string | undefined {
    return value && /^\/oauth\/continue\?state=[A-Za-z0-9_-]{20,128}$/.test(value) ? value : undefined;
}

export function safeReturnTo(returnTo: string): string {
    try {
        const url = new URL(returnTo, RETURN_TO_BASE_ORIGIN);
        if (url.origin === RETURN_TO_BASE_ORIGIN) {
            return url.pathname + url.search + url.hash;
        }
    } catch {
        // Malformed value; fall through to the safe default.
    }
    return '/';
}
