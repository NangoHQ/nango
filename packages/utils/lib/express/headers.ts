import type { IncomingHttpHeaders, OutgoingHttpHeaders } from 'http';

export function getHeaders(hs: IncomingHttpHeaders | OutgoingHttpHeaders): Record<string, string> {
    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(hs)) {
        if (typeof value === 'string') {
            headers[key] = value;
        } else if (Array.isArray(value)) {
            headers[key] = value.join(', ');
        }
    }
    return headers;
}
