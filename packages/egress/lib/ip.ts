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

function parseIpv6Hextet(value: string): number | null {
    const n = Number.parseInt(value, 16);
    if (Number.isNaN(n) || n < 0 || n > 0xffff) {
        return null;
    }
    return n;
}

function expandIpv6PrefixPart(addr: string): number[] | null {
    if (addr === '' || addr === '::') {
        return [];
    }
    if (!addr.includes('::')) {
        const groups = addr.split(':').filter(Boolean);
        const parsed = groups.map(parseIpv6Hextet);
        return parsed.some((g) => g === null) ? null : (parsed as number[]);
    }
    const [leftPart, rightPart] = addr.split('::');
    if (leftPart !== undefined && rightPart !== undefined && addr.indexOf('::') !== addr.lastIndexOf('::')) {
        return null;
    }
    const left = leftPart ? leftPart.split(':').filter(Boolean) : [];
    const right = rightPart ? rightPart.split(':').filter(Boolean) : [];
    if (left.length + right.length > 6) {
        return null;
    }
    const leftNums = left.map(parseIpv6Hextet);
    const rightNums = right.map(parseIpv6Hextet);
    if (leftNums.some((g) => g === null) || rightNums.some((g) => g === null)) {
        return null;
    }
    return [...(leftNums as number[]), ...(rightNums as number[])];
}

function expandIpv6Full(addr: string): number[] | null {
    if (!addr.includes('::')) {
        const groups = addr.split(':');
        if (groups.length !== 8) {
            return null;
        }
        const parsed = groups.map(parseIpv6Hextet);
        return parsed.some((g) => g === null) ? null : (parsed as number[]);
    }
    const [leftPart, rightPart] = addr.split('::');
    if (leftPart !== undefined && rightPart !== undefined && addr.indexOf('::') !== addr.lastIndexOf('::')) {
        return null;
    }
    const left = leftPart ? leftPart.split(':').filter(Boolean) : [];
    const right = rightPart ? rightPart.split(':').filter(Boolean) : [];
    if (left.length + right.length > 8) {
        return null;
    }
    const missing = 8 - left.length - right.length;
    if (missing < 0) {
        return null;
    }
    const leftNums = left.map(parseIpv6Hextet);
    const rightNums = right.map(parseIpv6Hextet);
    if (leftNums.some((g) => g === null) || rightNums.some((g) => g === null)) {
        return null;
    }
    return [...(leftNums as number[]), ...Array(missing).fill(0), ...(rightNums as number[])];
}

function expandIpv6ToHextets(ip: string): number[] | null {
    let addr = ip.toLowerCase();
    const zoneIdx = addr.indexOf('%');
    if (zoneIdx !== -1) {
        addr = addr.slice(0, zoneIdx);
    }

    const embeddedMatch = addr.match(/^(.*:)(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
    if (embeddedMatch) {
        const octets = embeddedMatch[2]!.split('.').map((p) => Number.parseInt(p, 10));
        if (octets.length !== 4 || octets.some((o) => Number.isNaN(o) || o < 0 || o > 255)) {
            return null;
        }
        const prefix = expandIpv6PrefixPart(embeddedMatch[1]!.replace(/:$/, '') || '::');
        if (!prefix) {
            return null;
        }
        const hi = (octets[0]! << 8) | octets[1]!;
        const lo = (octets[2]! << 8) | octets[3]!;
        return [...prefix, ...Array(6 - prefix.length).fill(0), hi, lo];
    }

    return expandIpv6Full(addr);
}

function hextetsToIpv4(h6: number, h7: number): string {
    return `${(h6 >> 8) & 0xff}.${h6 & 0xff}.${(h7 >> 8) & 0xff}.${h7 & 0xff}`;
}

function classifyBlockedIpv6(ip: string): BlockedIpReason | null {
    const hextets = expandIpv6ToHextets(ip);
    if (!hextets || hextets.length !== 8) {
        return null;
    }

    const [h0, h1, h2, h3, h4, h5, h6, h7] = hextets as [number, number, number, number, number, number, number, number];
    const leadingZeros = h0 === 0 && h1 === 0 && h2 === 0 && h3 === 0 && h4 === 0;

    if (hextets.every((h) => h === 0)) {
        return 'unspecified';
    }
    if (h0 === 0 && h1 === 0 && h2 === 0 && h3 === 0 && h4 === 0 && h5 === 0 && h6 === 0 && h7 === 1) {
        return 'loopback';
    }

    if (leadingZeros && h5 === 0xffff) {
        const mapped = classifyBlockedIpv4(hextetsToIpv4(h6, h7));
        if (mapped) {
            return mapped;
        }
    }

    if (leadingZeros && h5 === 0) {
        const compatible = classifyBlockedIpv4(hextetsToIpv4(h6, h7));
        if (compatible) {
            return compatible;
        }
    }

    if ((h0 & 0xffc0) === 0xfe80) {
        return 'link_local';
    }
    if ((h0 & 0xfe00) === 0xfc00) {
        return 'private';
    }

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
