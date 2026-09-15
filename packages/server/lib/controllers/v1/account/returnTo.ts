// Reserved TLD (RFC 2606) used only to resolve relative paths; a returnTo that escapes this origin is rejected.
const RETURN_TO_BASE_ORIGIN = 'https://internal.invalid';

export const MAX_RETURN_TO_LENGTH = 1024;

export function safeReturnTo(returnTo: string): string {
    if (returnTo.length > MAX_RETURN_TO_LENGTH) {
        return '/';
    }

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
