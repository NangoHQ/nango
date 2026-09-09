import { assertSafeOutboundUrl, getSafeUndiciDispatcher, isBlockedIpLiteral } from '@nangohq/egress';

import type { OutboundUrlPolicy } from '@nangohq/egress';
import type { Client } from 'oidc-provider';

export const CIMD_MAX_CLIENT_ID_BYTES = 512;
export const CIMD_MAX_DOCUMENT_BYTES = 5 * 1024;
export const CIMD_CACHE_MIN_SECONDS = 60;
export const CIMD_CACHE_MAX_SECONDS = 60 * 60;

const CIMD_OUTBOUND_POLICY: OutboundUrlPolicy = {
    mode: 'denylist',
    denylist: new Set(),
    allowlist: [],
    blockPrivateIps: true,
    blockLinkLocal: true,
    allowedSchemes: new Set(['https:']),
    maxRedirects: 0
};

const ALLOWED_GRANT_TYPES = new Set(['authorization_code', 'refresh_token']);
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

export async function allowCimdFetch(clientId: string): Promise<boolean> {
    if (!isValidCimdClientId(clientId)) {
        return false;
    }
    try {
        await assertSafeOutboundUrl(clientId, CIMD_OUTBOUND_POLICY, { context: 'oauth_cimd' });
        return true;
    } catch {
        return false;
    }
}

export function allowPublicCimdClient(client: Client, allowedScopes: ReadonlySet<string>): boolean {
    if (client.tokenEndpointAuthMethod !== 'none') {
        return false;
    }
    const grantTypes = client.grantTypes ?? [];
    const responseTypes = client.responseTypes ?? [];
    const responseModes = client.responseModes ?? [];
    const redirectUris = client.redirectUris ?? [];
    if (!grantTypes.includes('authorization_code') || grantTypes.some((grantType) => !ALLOWED_GRANT_TYPES.has(grantType))) {
        return false;
    }
    if (responseTypes.length !== 1 || responseTypes[0] !== 'code') {
        return false;
    }
    if (responseModes.some((responseMode) => responseMode !== 'query')) {
        return false;
    }
    if (!redirectUris.length || !redirectUris.every(isAllowedRedirectUri)) {
        return false;
    }
    if (client.scope && client.scope.split(' ').some((scope) => !allowedScopes.has(scope))) {
        return false;
    }
    return !client.jwksUri && !client.sectorIdentifierUri;
}

export function isValidCimdClientId(clientId: string): boolean {
    if (Buffer.byteLength(clientId, 'utf8') > CIMD_MAX_CLIENT_ID_BYTES || !clientId.startsWith('https://') || hasForbiddenRawUrlCodePoint(clientId)) {
        return false;
    }
    let url: URL;
    try {
        url = new URL(clientId);
    } catch {
        return false;
    }
    if (url.protocol !== 'https:' || url.username || url.password || url.hash || url.search) {
        return false;
    }

    const afterScheme = clientId.slice('https://'.length);
    const pathStart = afterScheme.indexOf('/');
    if (pathStart < 0) {
        return false;
    }
    const rawPath = afterScheme.slice(pathStart);
    return !rawPath.split('/').some((segment) => segment.replaceAll(/%2e/giu, '.') === '.' || segment.replaceAll(/%2e/giu, '.') === '..');
}

function hasForbiddenRawUrlCodePoint(value: string): boolean {
    for (let index = 0; index < value.length; index++) {
        const codePoint = value.charCodeAt(index);
        // Reject ASCII control characters and space (0x00-0x20), backslash (0x5c), and DEL (0x7f)
        // in the original string. URL parsers can trim controls or treat backslashes as slashes,
        // which could make validation, client ID comparison, and the eventual fetch disagree.
        if (codePoint <= 0x20 || codePoint === 0x5c || codePoint === 0x7f) {
            return true;
        }
    }
    return false;
}

export function isAllowedRedirectUri(value: string): boolean {
    let url: URL;
    try {
        url = new URL(value);
    } catch {
        return false;
    }
    // Userinfo can disguise the real callback host, while OAuth redirect URIs must not contain
    // fragments because fragments are not sent to the callback server. Paths, ports, and query
    // parameters remain valid and are checked through the protocol and hostname rules below.
    if (url.username || url.password || url.hash) {
        return false;
    }
    if (url.protocol === 'https:') {
        return (
            url.hostname !== 'localhost' &&
            !isBlockedIpLiteral(url.hostname, {
                blockPrivateIps: true,
                blockLinkLocal: true
            })
        );
    }
    return url.protocol === 'http:' && LOOPBACK_HOSTS.has(url.hostname);
}

export function secureCimdFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
    const dispatcher = getSafeUndiciDispatcher(CIMD_OUTBOUND_POLICY);
    return fetch(input, { ...init, redirect: 'manual', dispatcher } as RequestInit) as Promise<Response>;
}
