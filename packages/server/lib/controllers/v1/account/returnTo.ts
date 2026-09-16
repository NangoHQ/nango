// Reserved TLD (RFC 2606) used only to resolve relative paths; a returnTo that escapes this origin is rejected.
const RETURN_TO_BASE_ORIGIN = 'https://internal.invalid';
const oauthConsentReturnTo = /^\/oauth\/consent\/[A-Za-z0-9_-]+\/review$/;

export function isOAuthConsentReturnTo(returnTo: string | undefined): returnTo is string {
    return typeof returnTo === 'string' && oauthConsentReturnTo.test(returnTo);
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
