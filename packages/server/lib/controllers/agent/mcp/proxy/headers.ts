import type { Provider } from '@nangohq/types';

/**
 * Caller headers are merged over the credentials the proxy derives from the connection, so setting
 * one of these lets the agent authenticate as something other than the session's connection.
 * Provider query parameters are applied after the caller's and overwrite them, so only headers
 * need this.
 *
 * Credentials only. Every proxy entrypoint forwards the rest of what a caller sends, and lining
 * those up is one decision for all three rather than something this tool should do alone.
 *
 * Only this tool rejects even these. proxy_request is reached with an API key that already holds
 * the whole environment, and scripts override headers deliberately, so there it grants nothing new.
 */
const REJECTED_HEADERS = new Set(['authorization', 'cookie', 'proxy-authorization']);

/**
 * Which headers the agent may not set. `authorization` is only the credential for bearer-style
 * providers, so the provider's own credential headers are rejected too: an API key provider carries
 * its credential in something like `x-api-key`, and overriding that is the same escape.
 *
 * A templated value is what marks one. A provider header interpolates from the connection, so
 * `x-api-key: ${apiKey}` is a credential while a constant like `notion-version: 2022-06-28` is not
 * and stays the agent's to set.
 */
export function rejectedHeaderNames({ headers, provider }: { headers: Record<string, string> | undefined; provider: Provider | null }): string[] {
    if (!headers) {
        return [];
    }

    const credentialHeaders = Object.entries(provider?.proxy?.headers ?? {})
        .filter(([, template]) => typeof template === 'string' && template.includes('${'))
        .map(([name]) => name.toLowerCase());
    const rejected = new Set([...REJECTED_HEADERS, ...credentialHeaders]);

    return Object.keys(headers).filter((name) => rejected.has(name.toLowerCase()));
}
