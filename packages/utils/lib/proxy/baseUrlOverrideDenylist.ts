/**
 * Hostname form used for denylist matching: lowercase, no bracketed IPv6 wrapper, no trailing FQDN dot.
 *
 * Note: {@link https://url.spec.whatwg.org/ WHATWG URL} already normalizes IPv4 hostnames to dotted
 * decimal (`127.0.0.1`) for octal, hexadecimal, and 32-bit integer spellings. That applies to
 * `new URL(overrideUrl).hostname` in {@link isBaseUrlOverrideDenied}. Bare denylist entries are
 * passed through `new URL('http://…')` in {@link normalizeDenylistHost} so they use the same IPv4
 * rules. IPv6 literals must be bracketed when using bare form (`[::1]`), matching URL parsing.
 */
export const DEFAULT_NANGO_PROXY_BASE_URL_OVERRIDE_DENYLIST = ['169.254.169.254', 'metadata.google.internal', 'localhost', '127.0.0.1', '[::1]'] as const;

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

/**
 * Normalize a denylist entry to a lowercase hostname for comparison.
 * Accepts full URLs (`://` present), or bare hostnames / `host:port` / IPv4 literals — bare forms are
 * parsed with `new URL('http://…')` so IPv4 uses the same normalization as {@link isBaseUrlOverrideDenied}.
 */
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
            host = new URL(`http://${trimmed}`).hostname;
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
        // Fail closed when a denylist is configured but the override URL cannot be parsed (defense in depth vs. z.url()).
        return true;
    }
    return denylist.has(hostname);
}

export function mergeProxyBaseUrlOverrideDenylist(customEntries: string[]): string[] {
    const merged = [...DEFAULT_NANGO_PROXY_BASE_URL_OVERRIDE_DENYLIST, ...customEntries];
    return [...new Set(merged)];
}

/**
 * Resolve the denylist from a raw env string.
 * - unset (`undefined`) → secure defaults
 * - `''` or `'[]'` → empty (operator opt-out)
 * - JSON string array → merged with defaults
 */
export function resolveProxyBaseUrlOverrideDenylist(raw: string | undefined): string[] {
    if (raw === undefined) {
        return [...DEFAULT_NANGO_PROXY_BASE_URL_OVERRIDE_DENYLIST];
    }

    const trimmed = raw.trim();
    if (trimmed === '' || trimmed === '[]') {
        return [];
    }

    try {
        const parsed = JSON.parse(trimmed);
        if (!Array.isArray(parsed)) {
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
