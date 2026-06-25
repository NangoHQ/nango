import {
    DEFAULT_NANGO_PROXY_BASE_URL_OVERRIDE_DENYLIST,
    mergeProxyBaseUrlOverrideDenylist,
    normalizeDenylist,
    normalizeDenylistHost,
    resolveProxyBaseUrlOverrideDenylist,
    resolveProxyBaseUrlOverrideDenylistForRunner
} from './denylist.js';

export type OutboundUrlPolicyMode = 'denylist' | 'allowlist' | 'permissive';

export interface OutboundUrlPolicyRaw {
    mode?: OutboundUrlPolicyMode | undefined;
    denylist?: string[] | undefined;
    allowlist?: string[] | undefined;
    blockPrivateIps?: boolean | undefined;
    blockLinkLocal?: boolean | undefined;
    maxRedirects?: number | undefined;
}

export interface OutboundUrlPolicy {
    mode: OutboundUrlPolicyMode;
    denylist: Set<string>;
    allowlist: string[];
    blockPrivateIps: boolean;
    blockLinkLocal: boolean;
    allowedSchemes: Set<string>;
    maxRedirects: number;
}

export const DEFAULT_OUTBOUND_URL_POLICY: OutboundUrlPolicy = {
    mode: 'denylist',
    denylist: normalizeDenylist([...DEFAULT_NANGO_PROXY_BASE_URL_OVERRIDE_DENYLIST]),
    allowlist: [],
    blockPrivateIps: true,
    blockLinkLocal: true,
    allowedSchemes: new Set(['http:', 'https:']),
    maxRedirects: 5
};

function parsePolicyJson(raw: string | undefined): OutboundUrlPolicyRaw | null {
    if (raw === undefined) {
        return null;
    }
    const trimmed = raw.trim();
    if (!trimmed) {
        return null;
    }
    try {
        const parsed = JSON.parse(trimmed) as unknown;
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            return null;
        }
        return parsed as OutboundUrlPolicyRaw;
    } catch {
        return null;
    }
}

function mergePolicyRaw(base: OutboundUrlPolicyRaw, overlay: OutboundUrlPolicyRaw): OutboundUrlPolicyRaw {
    const merged: OutboundUrlPolicyRaw = { ...base };
    if (overlay.mode !== undefined) merged.mode = overlay.mode;
    if (overlay.denylist !== undefined) merged.denylist = overlay.denylist;
    if (overlay.allowlist !== undefined) merged.allowlist = overlay.allowlist;
    if (overlay.blockPrivateIps !== undefined) merged.blockPrivateIps = overlay.blockPrivateIps;
    if (overlay.blockLinkLocal !== undefined) merged.blockLinkLocal = overlay.blockLinkLocal;
    if (overlay.maxRedirects !== undefined) merged.maxRedirects = overlay.maxRedirects;
    return merged;
}

function safeMaxRedirects(value: unknown): number {
    if (typeof value === 'number' && Number.isInteger(value) && value >= 0) {
        return value;
    }
    return DEFAULT_OUTBOUND_URL_POLICY.maxRedirects;
}

function rawToPolicy(raw: OutboundUrlPolicyRaw, denylistEntries: string[]): OutboundUrlPolicy {
    const mode = raw.mode ?? (denylistEntries.length === 0 ? 'permissive' : 'denylist');
    const denylist = mode === 'permissive' ? new Set<string>() : normalizeDenylist(denylistEntries);

    return {
        mode,
        denylist,
        allowlist: raw.allowlist ?? [],
        blockPrivateIps: raw.blockPrivateIps ?? true,
        blockLinkLocal: raw.blockLinkLocal ?? true,
        allowedSchemes: new Set(['http:', 'https:']),
        maxRedirects: safeMaxRedirects(raw.maxRedirects)
    };
}

export interface ServerPolicyEnvInput {
    proxyBaseUrlOverrideDenylist: string[];
    outboundUrlPolicy?: OutboundUrlPolicyRaw | undefined;
}

/**
 * Build policy for server-side services from parsed env values.
 */
export function resolvePolicyForServer(input: ServerPolicyEnvInput): OutboundUrlPolicy {
    const jsonRaw = input.outboundUrlPolicy ?? null;
    const denylistEntries = input.proxyBaseUrlOverrideDenylist;

    if (!jsonRaw) {
        return rawToPolicy({}, denylistEntries);
    }

    const merged = mergePolicyRaw({}, jsonRaw);
    const effectiveDenylist =
        merged.denylist !== undefined ? mergeProxyBaseUrlOverrideDenylist(merged.denylist) : denylistEntries.length === 0 ? [] : denylistEntries;

    return rawToPolicy(merged, effectiveDenylist);
}

export interface RunnerPolicyEnvInput {
    proxyBaseUrlOverrideEnabled?: string | undefined;
    proxyBaseUrlOverrideDenylistRaw?: string | undefined;
    outboundUrlPolicy?: OutboundUrlPolicyRaw | undefined;
    lambdaRuntimeApi?: string | undefined;
}

function isBaseUrlOverrideEnabledFromEnv(raw: string | undefined): boolean {
    if (raw === undefined) {
        return true;
    }
    const normalized = raw.trim().toLowerCase();
    return normalized !== 'false' && normalized !== '0';
}

/**
 * Build policy for runner / runner-sdk. Always applies secure denylist defaults when env is empty.
 */
export function resolvePolicyForRunner(input: RunnerPolicyEnvInput): OutboundUrlPolicy {
    return resolvePolicyForRunnerSync(input);
}

export function resolvePolicyForRunnerSync(input: RunnerPolicyEnvInput): OutboundUrlPolicy {
    const overrideEnabled = isBaseUrlOverrideEnabledFromEnv(input.proxyBaseUrlOverrideEnabled);
    const denylistEntries = overrideEnabled
        ? resolveProxyBaseUrlOverrideDenylistForRunner(input.proxyBaseUrlOverrideDenylistRaw)
        : [...DEFAULT_NANGO_PROXY_BASE_URL_OVERRIDE_DENYLIST];

    const jsonRaw = input.outboundUrlPolicy ?? null;
    const policy = jsonRaw ? rawToPolicy(mergePolicyRaw({}, jsonRaw), denylistEntries) : rawToPolicy({}, denylistEntries);

    if (input.lambdaRuntimeApi) {
        const normalized = normalizeDenylistHost(input.lambdaRuntimeApi);
        if (normalized) {
            policy.denylist.add(normalized);
        }
    }

    return policy;
}

export function resolvePolicyFromProcessEnvForRunner(): OutboundUrlPolicy {
    const env = typeof process !== 'undefined' ? process.env : {};
    return resolvePolicyForRunnerSync({
        proxyBaseUrlOverrideEnabled: env['NANGO_PROXY_BASE_URL_OVERRIDE_ENABLED'],
        proxyBaseUrlOverrideDenylistRaw: env['NANGO_PROXY_BASE_URL_OVERRIDE_DENYLIST'],
        outboundUrlPolicy: parsePolicyJson(env['NANGO_OUTBOUND_URL_POLICY']) ?? undefined,
        lambdaRuntimeApi: env['AWS_LAMBDA_RUNTIME_API']
    });
}

export function resolveProxyDenylistFromServerRaw(raw: string | undefined): string[] {
    return resolveProxyBaseUrlOverrideDenylist(raw);
}

let memoizedRunnerPolicy: OutboundUrlPolicy | null = null;

export function getRunnerPolicyFromEnv(): OutboundUrlPolicy {
    if (memoizedRunnerPolicy) {
        return memoizedRunnerPolicy;
    }
    memoizedRunnerPolicy = resolvePolicyFromProcessEnvForRunner();
    return memoizedRunnerPolicy;
}

/**
 * OAuth-specific policy: blocks metadata/loopback/link-local + DNS rebinding by default;
 * RFC1918 blocking off unless explicitly configured.
 */
export function resolvePolicyForOAuth(input: { outboundUrlPolicyOAuthRaw?: string | undefined; outboundUrlPolicyRaw?: string | undefined }): OutboundUrlPolicy {
    const oauthRaw = parsePolicyJson(input.outboundUrlPolicyOAuthRaw);
    const baseRaw = parsePolicyJson(input.outboundUrlPolicyRaw);
    const merged = mergePolicyRaw(
        mergePolicyRaw(
            {
                blockPrivateIps: false,
                mode: 'denylist',
                denylist: [...DEFAULT_NANGO_PROXY_BASE_URL_OVERRIDE_DENYLIST]
            },
            baseRaw ?? {}
        ),
        oauthRaw ?? {}
    );
    return rawToPolicy(merged, mergeProxyBaseUrlOverrideDenylist(merged.denylist ?? []));
}
