/**
 * Hostname form used for denylist matching: lowercase, no bracketed IPv6 wrapper, no trailing FQDN dot.
 */
import net from 'node:net';

export const DEFAULT_NANGO_PROXY_BASE_URL_OVERRIDE_DENYLIST = [
    '169.254.169.254',
    'metadata.google.internal',
    'localhost',
    '127.0.0.1',
    '[::1]',
    '[::ffff:127.0.0.1]',
    '[::ffff:169.254.169.254]'
] as const;

export function canonicalizeHostnameForDenylist(host: string): string {
    let h = host.trim().toLowerCase();
    if (h.startsWith('[') && h.endsWith(']')) {
        h = h.slice(1, -1);
    }
    while (h.endsWith('.')) {
        h = h.slice(0, -1);
    }
    return h;
}

/** RFC 3986 host authority segment for URL construction (brackets IPv6 literals). */
export function formatHostForUrlAuthority(host: string): string {
    const canonical = canonicalizeHostnameForDenylist(host);
    if (net.isIP(canonical) === 6) {
        return `[${canonical}]`;
    }
    return canonical;
}

export function normalizeDenylistHost(entry: string): string {
    const trimmed = entry.trim();
    if (!trimmed) {
        return '';
    }
    let host: string;
    if (trimmed.includes('://')) {
        try {
            host = new URL(trimmed).hostname;
        } catch {
            host = trimmed;
        }
    } else {
        try {
            host = new URL(`http://${formatHostForUrlAuthority(trimmed)}/`).hostname;
        } catch {
            host = trimmed;
        }
    }
    return canonicalizeHostnameForDenylist(host);
}

export function normalizeDenylist(denylist: string[] | undefined): Set<string> {
    if (!denylist?.length) {
        return new Set();
    }
    return new Set(denylist.map(normalizeDenylistHost).filter(Boolean));
}

export function isBaseUrlOverrideDenied(overrideUrl: string, denylist: Set<string>): boolean {
    if (denylist.size === 0) {
        return false;
    }
    let hostname: string;
    try {
        hostname = canonicalizeHostnameForDenylist(new URL(overrideUrl).hostname);
    } catch {
        return true;
    }
    return denylist.has(hostname);
}

export function mergeProxyBaseUrlOverrideDenylist(customEntries: string[]): string[] {
    const merged = [...DEFAULT_NANGO_PROXY_BASE_URL_OVERRIDE_DENYLIST, ...customEntries];
    return [...new Set(merged)];
}

/**
 * Resolve the denylist from a raw env string (server semantics).
 * - unset → secure defaults
 * - '' or '[]' → empty (operator opt-out)
 * - JSON string array → merged with defaults
 */
export function resolveProxyBaseUrlOverrideDenylist(raw: string | undefined): string[] {
    if (raw === undefined) {
        return [...DEFAULT_NANGO_PROXY_BASE_URL_OVERRIDE_DENYLIST];
    }

    const trimmed = raw.trim();
    if (trimmed === '') {
        return [];
    }

    try {
        const parsed = JSON.parse(trimmed);
        if (!Array.isArray(parsed)) {
            return [];
        }
        if (parsed.length === 0) {
            return [];
        }
        const customEntries = parsed
            .filter((v): v is string => typeof v === 'string')
            .map((v) => v.trim())
            .filter(Boolean);
        return mergeProxyBaseUrlOverrideDenylist(customEntries);
    } catch {
        return [];
    }
}

/**
 * Runner-side denylist resolution. Unlike server env parsing, runners always apply secure defaults
 * when the env is unset or empty so a server-level opt-out is not inherited.
 */
export function resolveProxyBaseUrlOverrideDenylistForRunner(raw: string | undefined): string[] {
    if (raw === undefined) {
        return [...DEFAULT_NANGO_PROXY_BASE_URL_OVERRIDE_DENYLIST];
    }

    const trimmed = raw.trim();
    if (trimmed === '') {
        return [...DEFAULT_NANGO_PROXY_BASE_URL_OVERRIDE_DENYLIST];
    }

    try {
        const parsed = JSON.parse(trimmed);
        if (!Array.isArray(parsed)) {
            return [...DEFAULT_NANGO_PROXY_BASE_URL_OVERRIDE_DENYLIST];
        }
        if (parsed.length === 0) {
            return [...DEFAULT_NANGO_PROXY_BASE_URL_OVERRIDE_DENYLIST];
        }
        const customEntries = parsed
            .filter((v): v is string => typeof v === 'string')
            .map((v) => v.trim())
            .filter(Boolean);
        return mergeProxyBaseUrlOverrideDenylist(customEntries);
    } catch {
        return [...DEFAULT_NANGO_PROXY_BASE_URL_OVERRIDE_DENYLIST];
    }
}
