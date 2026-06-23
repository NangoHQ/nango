import dns from 'node:dns/promises';
import net from 'node:net';

import { canonicalizeHostnameForDenylist, isBaseUrlOverrideDenied } from './denylist.js';
import { OutboundUrlError } from './errors.js';
import { isBlockedIpLiteral } from './ip.js';

import type { OutboundUrlPolicy } from './policy.js';
import type { LookupAddress } from 'node:dns';

export interface ValidateOutboundUrlContext {
    /** e.g. proxy, webhook, uncontrolled_fetch, oauth */
    context?: string;
}

export interface ValidateOutboundUrlResult {
    ok: true;
    url: URL;
    hostname: string;
    resolvedAddresses?: string[];
}

export interface ValidateOutboundUrlFailure {
    ok: false;
    error: OutboundUrlError;
}

export type ValidateOutboundUrlOutcome = ValidateOutboundUrlResult | ValidateOutboundUrlFailure;

function parseUrl(url: string): URL | null {
    try {
        return new URL(url);
    } catch {
        return null;
    }
}

function hostnameMatchesAllowlist(hostname: string, allowlist: string[]): boolean {
    const canonical = canonicalizeHostnameForDenylist(hostname);
    for (const entry of allowlist) {
        const normalized = entry.trim().toLowerCase();
        if (!normalized) continue;
        if (normalized.startsWith('.')) {
            if (canonical === normalized.slice(1) || canonical.endsWith(normalized)) {
                return true;
            }
        } else if (canonical === normalized || canonical.endsWith(`.${normalized}`)) {
            return true;
        }
    }
    return false;
}

function checkAllowlist(hostname: string, policy: OutboundUrlPolicy): OutboundUrlError | null {
    if (policy.mode !== 'allowlist' || policy.allowlist.length === 0) {
        return null;
    }
    if (!hostnameMatchesAllowlist(hostname, policy.allowlist)) {
        return new OutboundUrlError('allowlist_miss', 'URL hostname is not on the outbound allowlist.', { hostname });
    }
    return null;
}

function checkScheme(parsed: URL, policy: OutboundUrlPolicy): OutboundUrlError | null {
    if (!policy.allowedSchemes.has(parsed.protocol)) {
        return new OutboundUrlError('invalid_scheme', `URL scheme ${parsed.protocol} is not allowed.`, {
            url: parsed.href,
            hostname: parsed.hostname
        });
    }
    return null;
}

function checkHostnameDenylist(url: string, hostname: string, policy: OutboundUrlPolicy): OutboundUrlError | null {
    if (policy.mode === 'permissive') {
        return null;
    }
    if (policy.denylist.size > 0 && isBaseUrlOverrideDenied(url, policy.denylist)) {
        return new OutboundUrlError('denied_hostname', 'URL hostname is denied by outbound policy.', { url, hostname });
    }
    return null;
}

function checkIpLiteral(hostname: string, policy: OutboundUrlPolicy, url: string): OutboundUrlError | null {
    const blocked = isBlockedIpLiteral(hostname, {
        blockPrivateIps: policy.blockPrivateIps,
        blockLinkLocal: policy.blockLinkLocal
    });
    if (blocked) {
        return new OutboundUrlError('denied_ip', `URL resolves to a blocked address (${blocked}).`, { url, hostname });
    }
    return null;
}

export function validateOutboundUrlSync(url: string, policy: OutboundUrlPolicy, _ctx?: ValidateOutboundUrlContext): ValidateOutboundUrlOutcome {
    const parsed = parseUrl(url);
    if (!parsed) {
        return { ok: false, error: new OutboundUrlError('invalid_url', 'URL could not be parsed.', { url }) };
    }

    const schemeErr = checkScheme(parsed, policy);
    if (schemeErr) {
        return { ok: false, error: schemeErr };
    }

    const hostname = canonicalizeHostnameForDenylist(parsed.hostname);

    const allowlistErr = checkAllowlist(hostname, policy);
    if (allowlistErr) {
        return { ok: false, error: allowlistErr };
    }

    const denylistErr = checkHostnameDenylist(parsed.href, hostname, policy);
    if (denylistErr) {
        return { ok: false, error: denylistErr };
    }

    const ipErr = checkIpLiteral(hostname, policy, parsed.href);
    if (ipErr) {
        return { ok: false, error: ipErr };
    }

    return { ok: true, url: parsed, hostname };
}

async function resolveAndValidateAddresses(
    hostname: string,
    policy: OutboundUrlPolicy,
    url: string
): Promise<{ ok: true; addresses: string[] } | { ok: false; error: OutboundUrlError }> {
    if (net.isIP(hostname)) {
        const blocked = isBlockedIpLiteral(hostname, {
            blockPrivateIps: policy.blockPrivateIps,
            blockLinkLocal: policy.blockLinkLocal
        });
        if (blocked) {
            return {
                ok: false,
                error: new OutboundUrlError('denied_dns', `Resolved address is blocked (${blocked}).`, { url, hostname })
            };
        }
        return { ok: true, addresses: [hostname] };
    }

    let records: LookupAddress[];
    try {
        records = await dns.lookup(hostname, { all: true, verbatim: true });
    } catch (err) {
        return {
            ok: false,
            error: new OutboundUrlError('dns_resolution_failed', 'DNS resolution failed.', { url, hostname, cause: err })
        };
    }

    if (records.length === 0) {
        return {
            ok: false,
            error: new OutboundUrlError('dns_resolution_failed', 'DNS resolution returned no addresses.', { url, hostname })
        };
    }

    const addresses: string[] = [];
    for (const record of records) {
        const blocked = isBlockedIpLiteral(record.address, {
            blockPrivateIps: policy.blockPrivateIps,
            blockLinkLocal: policy.blockLinkLocal
        });
        if (blocked) {
            return {
                ok: false,
                error: new OutboundUrlError('denied_dns', `DNS resolved to blocked address (${blocked}).`, {
                    url,
                    hostname
                })
            };
        }
        addresses.push(record.address);
    }

    return { ok: true, addresses };
}

export async function validateOutboundUrlAsync(url: string, policy: OutboundUrlPolicy, ctx?: ValidateOutboundUrlContext): Promise<ValidateOutboundUrlOutcome> {
    const syncResult = validateOutboundUrlSync(url, policy, ctx);
    if (!syncResult.ok) {
        return syncResult;
    }

    if (!policy.resolveDns) {
        return syncResult;
    }

    const hostname = syncResult.hostname;
    if (net.isIP(hostname)) {
        return syncResult;
    }

    const dnsResult = await resolveAndValidateAddresses(hostname, policy, syncResult.url.href);
    if (!dnsResult.ok) {
        return { ok: false, error: dnsResult.error };
    }

    return { ok: true, url: syncResult.url, hostname, resolvedAddresses: dnsResult.addresses };
}

export function assertSafeOutboundUrlSync(url: string, policy: OutboundUrlPolicy, ctx?: ValidateOutboundUrlContext): URL {
    const result = validateOutboundUrlSync(url, policy, ctx);
    if (!result.ok) {
        throw result.error;
    }
    return result.url;
}

export async function assertSafeOutboundUrl(url: string, policy: OutboundUrlPolicy, ctx?: ValidateOutboundUrlContext): Promise<URL> {
    const result = await validateOutboundUrlAsync(url, policy, ctx);
    if (!result.ok) {
        throw result.error;
    }
    return result.url;
}

export function isOutboundUrlAllowed(url: string, policy: OutboundUrlPolicy): boolean {
    return validateOutboundUrlSync(url, policy).ok;
}

export function isBaseUrlOverrideDeniedByPolicy(url: string, policy: OutboundUrlPolicy): boolean {
    return !validateOutboundUrlSync(url, policy).ok;
}
