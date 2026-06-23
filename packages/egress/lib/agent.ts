import dns from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';

import { assertSafeOutboundUrl } from './validate.js';

import type { OutboundUrlPolicy } from './policy.js';
import type { LookupAddress, LookupOptions } from 'node:dns';

type LookupCallback = (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void;

const pinnedAddresses = new Map<string, { addresses: string[]; expiresAt: number }>();
const PIN_TTL_MS = 30_000;

async function resolvePinnedAddresses(hostname: string, policy: OutboundUrlPolicy): Promise<string[]> {
    const cacheKey = `${hostname}:${policy.blockPrivateIps}:${policy.blockLinkLocal}`;
    const cached = pinnedAddresses.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
        return cached.addresses;
    }

    await assertSafeOutboundUrl(`http://${hostname}/`, policy);
    const records = await dns.promises.lookup(hostname, { all: true, verbatim: true });
    const addresses = records.map((r) => r.address);
    pinnedAddresses.set(cacheKey, { addresses, expiresAt: Date.now() + PIN_TTL_MS });
    return addresses;
}

export function clearPinnedAddressCacheForTests(): void {
    pinnedAddresses.clear();
}

export function createSafeLookup(policy: OutboundUrlPolicy): typeof dns.lookup {
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
                const addresses = await resolvePinnedAddresses(hostname, policy);
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
