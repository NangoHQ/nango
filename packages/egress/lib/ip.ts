import net from 'node:net';

import { canonicalizeHostnameForDenylist } from './denylist.js';

export type BlockedIpReason = 'loopback' | 'private' | 'link_local' | 'metadata' | 'unspecified';

/**
 * Returns a reason when the address must be blocked, or null when allowed.
 */
export function classifyBlockedIp(address: string): BlockedIpReason | null {
    const canonical = canonicalizeHostnameForDenylist(address);

    // IPv4-mapped IPv6
    if (canonical.startsWith('::ffff:')) {
        const mapped = canonical.slice('::ffff:'.length);
        if (net.isIP(mapped) === 4) {
            return classifyBlockedIp(mapped);
        }
    }

    const ipVersion = net.isIP(canonical);
    if (ipVersion === 4) {
        return classifyBlockedIpv4(canonical);
    }
    if (ipVersion === 6) {
        return classifyBlockedIpv6(canonical);
    }

    return null;
}

function classifyBlockedIpv4(ip: string): BlockedIpReason | null {
    const parts = ip.split('.').map((p) => Number.parseInt(p, 10));
    if (parts.length !== 4 || parts.some((p) => Number.isNaN(p))) {
        return null;
    }
    const [a, b] = parts as [number, number, number, number];

    if (a === 127) return 'loopback';
    if (a === 10) return 'private';
    if (a === 172 && b >= 16 && b <= 31) return 'private';
    if (a === 192 && b === 168) return 'private';
    if (a === 169 && b === 254) return 'link_local';
    if (a === 0) return 'unspecified';
    if (a === 100 && b >= 64 && b <= 127) return 'private'; // CGNAT

    return null;
}

function classifyBlockedIpv6(ip: string): BlockedIpReason | null {
    const lower = ip.toLowerCase();
    if (lower === '::1') return 'loopback';
    if (lower === '::') return 'unspecified';
    if (lower.startsWith('fe80:')) return 'link_local';
    if (lower.startsWith('fc') || lower.startsWith('fd')) return 'private';
    return null;
}

export function isBlockedIpLiteral(hostname: string, options: { blockPrivateIps: boolean; blockLinkLocal: boolean }): BlockedIpReason | null {
    const canonical = canonicalizeHostnameForDenylist(hostname);
    const reason = classifyBlockedIp(canonical);
    if (!reason) {
        return null;
    }
    if (reason === 'private' && !options.blockPrivateIps) {
        return null;
    }
    if (reason === 'link_local' && !options.blockLinkLocal) {
        return null;
    }
    if (reason === 'loopback' || reason === 'metadata' || reason === 'unspecified') {
        return reason;
    }
    if (reason === 'private' && options.blockPrivateIps) {
        return reason;
    }
    if (reason === 'link_local' && options.blockLinkLocal) {
        return reason;
    }
    return null;
}
