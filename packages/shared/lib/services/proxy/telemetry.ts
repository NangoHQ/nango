import { getLogger, metrics } from '@nangohq/utils';

import type { ConnectionForProxy, IntegrationConfigForProxy, ProxyInterpolationEvent } from '@nangohq/types';

const logger = getLogger('proxy.security.monitoring');

export interface ProxyMonitoringContext {
    callsite: 'proxy' | 'sdk' | 'verification';
    accountId: number;
    environmentId: number;
    apiKeyId?: number | undefined;
    provider: string;
    integrationId: string;
    endpoint: string;
    baseUrlOverride?: string | undefined;
    connection: ConnectionForProxy;
    integrationConfig?: IntegrationConfigForProxy | undefined;
}

/** Keep useful destinations/paths, excluding query values, URL passwords and known connection data. */
export function redactProxyTelemetryUrl(url: string | undefined, context: Pick<ProxyMonitoringContext, 'connection' | 'integrationConfig'>): string | null {
    if (!url) return null;
    let redacted = url.split(/[?#]/)[0]!.replace(/(https?:\/\/)[^/]*@/i, '$1');
    const values = new Set<string>();
    const collect = (value: unknown): void => {
        if (typeof value === 'string' && value) values.add(value);
        else if (value && typeof value === 'object') Object.values(value).forEach(collect);
    };
    collect(context.connection.credentials);
    collect(context.connection.connection_config);
    collect(context.integrationConfig);
    for (const value of [...values].sort((left, right) => right.length - left.length)) {
        for (const variant of [value, encodeURIComponent(value)]) redacted = redacted.split(variant).join('REDACTED');
    }
    return redacted;
}

export function proxyMonitoringAttributes(context: ProxyMonitoringContext) {
    return {
        callsite: context.callsite,
        accountId: context.accountId,
        environmentId: context.environmentId,
        apiKeyId: context.apiKeyId ?? null,
        provider: context.provider,
        integrationId: context.integrationId,
        baseUrlOverride: redactProxyTelemetryUrl(context.baseUrlOverride, context),
        path: redactProxyTelemetryUrl(context.endpoint, context)
    };
}

/** One observation per location/source/field set per request, including retries. */
export function createProxyInterpolationObserver(getContext: () => ProxyMonitoringContext): (event: ProxyInterpolationEvent) => void {
    const observed = new Set<string>();
    return (event) => {
        const key = JSON.stringify(event);
        if (observed.has(key)) return;
        observed.add(key);
        const context = getContext();
        const callerSupplied = event.location.startsWith('caller_');
        metrics.increment(metrics.Types.PROXY_SECRET_INTERPOLATION, 1, {
            callsite: context.callsite,
            provider: context.provider,
            location: event.location,
            credentialType: event.credentialType,
            callerSupplied: String(callerSupplied)
        });
        logger.info('Proxy secret interpolation observed', {
            event: 'proxy_secret_interpolation',
            ...proxyMonitoringAttributes(context),
            ...event,
            callerSupplied,
            wouldBlock: callerSupplied
        });
    };
}
