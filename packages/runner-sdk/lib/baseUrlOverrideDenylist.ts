/**
 * Hostname form used for denylist matching: lowercase, no bracketed IPv6 wrapper, no trailing FQDN dot.
 *
 * Note: WHATWG URL already normalizes IPv4 hostnames to dotted decimal (`127.0.0.1`) for octal,
 * hexadecimal, and 32-bit integer spellings. That applies to `new URL(url).hostname` in
 * {@link isBaseUrlOverrideDenied}. Bare denylist entries are passed through `new URL('http://…')`
 * in {@link normalizeDenylistHost} so they use the same IPv4 rules. IPv6 literals must be bracketed
 * when using bare form (`[::1]`), matching URL parsing.
 */
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
        // Fail closed when a denylist is configured but the URL cannot be parsed.
        return true;
    }

    return denylist.has(hostname);
}

let memoizedBaseUrlOverrideDenylist: Set<string> | null = null;

function parseDenylistEnvValue(raw: string | undefined): string[] {
    if (!raw) {
        return [];
    }

    const trimmed = raw.trim();
    if (!trimmed) {
        return [];
    }

    // Matches server behavior: env is a JSON array of strings.
    try {
        const parsed = JSON.parse(trimmed);
        if (!Array.isArray(parsed)) {
            return [];
        }
        return parsed
            .filter((v): v is string => typeof v === 'string')
            .map((v) => v.trim())
            .filter(Boolean);
    } catch {
        // If the env is misconfigured, fail open (denylist disabled) rather than breaking user scripts.
        return [];
    }
}

export function getBaseUrlOverrideDenylistFromEnv(): Set<string> {
    if (memoizedBaseUrlOverrideDenylist) {
        return memoizedBaseUrlOverrideDenylist;
    }

    const raw = typeof process !== 'undefined' ? process.env['NANGO_PROXY_BASE_URL_OVERRIDE_DENYLIST'] : undefined;
    const denylist = normalizeDenylist(parseDenylistEnvValue(raw));

    // In AWS Lambda, this env points to the internal runtime API (commonly `127.0.0.1:9001`).
    // We always deny it to prevent accidental SSRF access from user-provided overrides.
    const lambdaRuntimeApi = typeof process !== 'undefined' ? process.env['AWS_LAMBDA_RUNTIME_API'] : undefined;
    if (lambdaRuntimeApi) {
        const normalized = normalizeDenylistHost(lambdaRuntimeApi);
        if (normalized) {
            denylist.add(normalized);
        }
    }

    memoizedBaseUrlOverrideDenylist = denylist;
    return memoizedBaseUrlOverrideDenylist;
}
