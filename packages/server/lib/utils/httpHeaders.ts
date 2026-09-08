/**
 * Hop-by-hop headers, RFC 7230 section 6.1. They describe a single transport hop rather than the
 * message.
 *
 * Acting on that is each surface's own call. allProxy drops them from provider responses, and the
 * agent session proxy tool refuses them from the agent. The proxy API and proxy_request leave
 * caller headers alone on purpose, so that a management API key behaves the same as the public API.
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
