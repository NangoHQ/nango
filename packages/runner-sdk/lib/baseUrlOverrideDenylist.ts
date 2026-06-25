export {
    DEFAULT_NANGO_PROXY_BASE_URL_OVERRIDE_DENYLIST,
    canonicalizeHostnameForDenylist,
    isBaseUrlOverrideDenied,
    mergeProxyBaseUrlOverrideDenylist,
    normalizeDenylist,
    normalizeDenylistHost,
    resolveProxyBaseUrlOverrideDenylistForRunner as resolveProxyBaseUrlOverrideDenylist
} from '@nangohq/egress';

export function isBaseUrlOverridePolicyEnabledFromEnv(): boolean {
    const raw = typeof process !== 'undefined' ? process.env['NANGO_PROXY_BASE_URL_OVERRIDE_ENABLED'] : undefined;
    if (raw === undefined) {
        return true;
    }
    const normalized = raw.trim().toLowerCase();
    return normalized !== 'false' && normalized !== '0';
}
