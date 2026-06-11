/**
 * Denylist helpers for runner-sdk sandbox code.
 *
 * Keep aligned with `packages/utils/lib/proxy/baseUrlOverrideDenylist.ts` (canonical for services).
 * runner-sdk cannot depend on other `@nangohq/*` packages, so this module is duplicated in-package.
 */
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
        return true;
    }

    return denylist.has(hostname);
}

export function mergeProxyBaseUrlOverrideDenylist(customEntries: string[]): string[] {
    const merged = [...DEFAULT_NANGO_PROXY_BASE_URL_OVERRIDE_DENYLIST, ...customEntries];
    return [...new Set(merged)];
}

function isBaseUrlOverrideEnabledFromEnv(): boolean {
    const raw = typeof process !== 'undefined' ? process.env['NANGO_PROXY_BASE_URL_OVERRIDE_ENABLED'] : undefined;
    if (raw === undefined) {
        return true;
    }
    const normalized = raw.trim().toLowerCase();
    return normalized !== 'false' && normalized !== '0';
}

/**
 * Runner-side denylist resolution. Unlike server env parsing, runners always apply secure defaults
 * when the env is unset or empty (`[]` / `''`) so a server-level opt-out is not inherited.
 */
export function resolveProxyBaseUrlOverrideDenylist(raw: string | undefined): string[] {
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
            return [];
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
        return [];
    }
}

let memoizedBaseUrlOverrideDenylist: Set<string> | null = null;

export function isBaseUrlOverridePolicyEnabledFromEnv(): boolean {
    return isBaseUrlOverrideEnabledFromEnv();
}

export function getBaseUrlOverrideDenylistFromEnv(): Set<string> {
    if (memoizedBaseUrlOverrideDenylist) {
        return memoizedBaseUrlOverrideDenylist;
    }

    const raw = typeof process !== 'undefined' ? process.env['NANGO_PROXY_BASE_URL_OVERRIDE_DENYLIST'] : undefined;
    const entries = isBaseUrlOverrideEnabledFromEnv() ? resolveProxyBaseUrlOverrideDenylist(raw) : [...DEFAULT_NANGO_PROXY_BASE_URL_OVERRIDE_DENYLIST];
    const denylist = normalizeDenylist(entries);

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
