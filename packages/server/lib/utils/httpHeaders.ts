/**
 * Hop-by-hop headers, RFC 7230 section 6.1. They describe a single transport hop rather than the
 * message, so they are neither forwarded from a provider response nor accepted from a caller who
 * is not the one making the hop.
 */
export const HOP_BY_HOP_HEADERS = new Set([
    'connection',
    'keep-alive',
    'proxy-authenticate',
    'proxy-authorization',
    'te',
    'trailer',
    'transfer-encoding',
    'upgrade'
]);
