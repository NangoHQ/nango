import dns from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';

import { formatHostForUrlAuthority } from './denylist.js';
import { resolveValidatedHostAddresses, validateOutboundUrlSync } from './validate.js';

import type { OutboundUrlPolicy } from './policy.js';
import type { LookupAddress, LookupOptions } from 'node:dns';

type LookupCallback = (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void;

const pinnedAddresses = new Map<string, { addresses: string[]; expiresAt: number }>();
const PIN_TTL_MS = 30_000;
const MAX_PINNED_ADDRESSES = 1_000;

function policyPinCacheKey(policy: OutboundUrlPolicy): string {
    const denylist = [...policy.denylist].sort().join(',');
    const allowlist = policy.allowlist
        .map((entry) => entry.trim().toLowerCase())
        .filter(Boolean)
        .sort()
        .join(',');
    const schemes = [...policy.allowedSchemes].sort().join(',');
    return `${policy.mode}|${denylist}|${allowlist}|${policy.blockPrivateIps}|${policy.blockLinkLocal}|${schemes}`;
}

async function resolvePinnedAddresses(hostname: string, policy: OutboundUrlPolicy, policyCacheKey: string): Promise<string[]> {
    const cacheKey = `${hostname}:${policyCacheKey}`;
    const cached = pinnedAddresses.get(cacheKey);
    if (cached !== undefined && cached.expiresAt > Date.now()) {
        return cached.addresses;
    }
    if (cached) {
        pinnedAddresses.delete(cacheKey);
    }

    const url = `http://${formatHostForUrlAuthority(hostname)}/`;
    const syncResult = validateOutboundUrlSync(url, policy);
    if (!syncResult.ok) {
        throw syncResult.error;
    }

    const addresses = await resolveValidatedHostAddresses(syncResult.hostname, policy, url);

    pinnedAddresses.delete(cacheKey);
    pinnedAddresses.set(cacheKey, { addresses, expiresAt: Date.now() + PIN_TTL_MS });
    if (pinnedAddresses.size > MAX_PINNED_ADDRESSES) {
        const oldest = pinnedAddresses.keys().next().value;
        if (oldest !== undefined) {
            pinnedAddresses.delete(oldest);
        }
    }

    return addresses;
}

export function clearPinnedAddressCacheForTests(): void {
    pinnedAddresses.clear();
}

export function getPinnedAddressCacheSizeForTests(): number {
    return pinnedAddresses.size;
}

export function createSafeLookup(policy: OutboundUrlPolicy): typeof dns.lookup {
    const policyCacheKey = policyPinCacheKey(policy);
    const safeLookup = function safeLookup(hostname: string, options: LookupOptions | LookupCallback, callback?: LookupCallback): void {
        let opts: LookupOptions;
        let cb: LookupCallback;

        if (typeof options === 'function') {
            cb = options;
            opts = {};
        } else {
            opts = options;
            cb = callback!;
        }

        void (async () => {
            try {
                const addresses = await resolvePinnedAddresses(hostname, policy, policyCacheKey);
                if (addresses.length === 0) {
                    cb(new Error('No addresses resolved'), '', 0);
                    return;
                }

                const all = opts.all === true;
                if (all) {
                    const family = opts.family;
                    const filtered = family === 4 || family === 6 ? addresses.filter((a) => net.isIP(a) === family) : addresses;
                    const result: LookupAddress[] = filtered.map((address) => ({
                        address,
                        family: net.isIP(address) as 4 | 6
                    }));
                    cb(null, result);
                    return;
                }

                const address = addresses[0]!;
                cb(null, address, net.isIP(address));
            } catch (err) {
                cb(err as NodeJS.ErrnoException, '', 0);
            }
        })();
    };

    return Object.assign(safeLookup, { __promisify__: dns.lookup.__promisify__ }) as typeof dns.lookup;
}

export function createSafeHttpAgents(policy: OutboundUrlPolicy): { httpAgent: http.Agent; httpsAgent: https.Agent } {
    const lookup = createSafeLookup(policy);
    return {
        httpAgent: new http.Agent({ lookup, keepAlive: true }),
        httpsAgent: new https.Agent({ lookup, keepAlive: true })
    };
}

export function agentForUrl(url: string, agents: { httpAgent: http.Agent; httpsAgent: https.Agent }): http.Agent | https.Agent {
    return url.startsWith('https:') ? agents.httpsAgent : agents.httpAgent;
}
