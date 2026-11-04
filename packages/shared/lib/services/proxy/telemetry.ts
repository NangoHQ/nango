import { getLogger, hasApiKeyScope } from '@nangohq/utils';

import { interpolateIfNeeded } from '../../utils/utils.js';

import type { ApplicationConstructedProxyConfiguration, ConnectionForProxy, IntegrationConfigForProxy } from '@nangohq/types';

export interface ProxyTracking {
    properties: NonNullable<ReturnType<typeof proxyMonitoringAttributes>>;
    interpolations: Set<string>;
}

type CredentialType = 'connection_credentials' | 'connection_config' | 'other';

const logger = getLogger('ProxyTracking');

/** Routed to a dedicated Datadog index by `logType`; runner proxy calls make this too high-volume for product analytics. */
export const proxyTrackingLogger = {
    log(event: 'proxy:interpolation' | 'proxy:base_url_override', properties: Record<string, unknown>): void {
        logger.info(event, { logType: 'proxy-tracking', ...properties });
    }
};

/** Observe resolved substitutions without changing interpolation behavior or exposing their values. */
export function interpolateProxyTemplate(
    template: string,
    replacers: Record<string, any>,
    config: ApplicationConstructedProxyConfiguration,
    connection: ConnectionForProxy,
    location: 'caller_endpoint' | 'caller_base_url_override' | 'provider_query' | 'provider_body',
    tracking?: ProxyTracking
): string {
    if (!tracking) {
        return interpolateIfNeeded(template, replacers);
    }

    const groups = new Map<string, { credentialType: CredentialType; secret: boolean; fields: Set<string> }>();
    const result = interpolateIfNeeded(template, replacers, (expression) => {
        let credentialType: CredentialType = 'other';
        let secret = false;
        if (expression.startsWith('connectionConfig.') || expression.startsWith('connection_config.')) {
            const field = expression.replace(/^connection(?:Config|_config)\./, '');
            credentialType = 'connection_config';
            secret = Object.entries(config.provider.connection_config ?? {}).some(
                ([key, definition]) => definition.secret === true && (field === key || field.startsWith(`${key}.`))
            );
        } else if (
            expression === 'credentials' ||
            expression.startsWith('credentials.') ||
            expression === 'accessToken' ||
            Object.hasOwn(connection.credentials, expression.split('.')[0] ?? '')
        ) {
            credentialType = 'connection_credentials';
        }

        const key = `${credentialType}:${secret}`;
        const group = groups.get(key) ?? { credentialType, secret, fields: new Set<string>() };
        group.fields.add(expression);
        groups.set(key, group);
    });

    for (const { credentialType, secret, fields } of groups.values()) {
        const fieldNames = [...fields].sort();
        const key = JSON.stringify([location, credentialType, secret, fieldNames]);
        if (tracking.interpolations.has(key)) continue;
        tracking.interpolations.add(key);
        const credentials = credentialType === 'connection_credentials';
        const callerSupplied = location.startsWith('caller_');
        try {
            proxyTrackingLogger.log('proxy:interpolation', {
                ...tracking.properties,
                location,
                credential_type: credentialType,
                fields: fieldNames.join(','),
                secret,
                credentials,
                integration_credentials: false,
                caller_supplied: callerSupplied,
                would_block: callerSupplied && (credentials || secret)
            });
        } catch {
            // Monitoring must not interrupt an otherwise valid proxy request.
        }
    }
    return result;
}

/** Exclude query values, URL passwords and known connection/integration data. */
export function redactProxyTelemetryUrl(url: string | undefined, connection: ConnectionForProxy, integrationConfig?: IntegrationConfigForProxy): string | null {
    if (!url) return null;
    let redacted = url.split(/[?#]/)[0]!.replace(/(https?:\/\/)[^/]*@/i, '$1');
    const values = new Set<string>();
    const collect = (value: unknown): void => {
        if (typeof value === 'string' && value) values.add(value);
        else if (value && typeof value === 'object') Object.values(value).forEach(collect);
    };
    collect(connection.credentials);
    collect(connection.connection_config);
    collect(integrationConfig);
    for (const value of [...values].sort((left, right) => right.length - left.length)) {
        for (const variant of [value, encodeURIComponent(value)]) redacted = redacted.split(variant).join('REDACTED');
    }
    return redacted;
}

export function proxyMonitoringAttributes(
    config: ApplicationConstructedProxyConfiguration,
    connection: ConnectionForProxy,
    integrationConfig?: IntegrationConfigForProxy
) {
    const context = config.monitoringContext;
    if (!context) return;
    try {
        const baseUrlOverride = redactProxyTelemetryUrl(config.baseUrlOverride, connection, integrationConfig);
        let overrideHost: string | null = null;
        if (baseUrlOverride) {
            try {
                overrideHost = new URL(baseUrlOverride).hostname;
            } catch {
                /* Templates may not be valid URLs before interpolation. */
            }
        }
        return {
            callsite: context.callsite,
            account_id: context.accountId,
            environment_id: context.environmentId,
            api_key_id: context.apiKey?.keyId ?? null,
            api_key_source: context.apiKey?.source ?? null,
            provider: config.providerName,
            integration_id: config.providerConfigKey,
            http_method: config.method,
            base_url_override: baseUrlOverride,
            override_host: overrideHost,
            // Keep pre-interpolation paths to understand template usage. Known connection/integration
            // values are redacted; other caller-supplied path segments are intentionally retained.
            path: redactProxyTelemetryUrl(config.endpoint, connection, integrationConfig)
        };
    } catch {
        // Monitoring must not interrupt an otherwise valid proxy request.
        return;
    }
}

export function trackBaseUrlOverride(config: ApplicationConstructedProxyConfiguration, properties: ProxyTracking['properties']): void {
    if (!config.baseUrlOverride) return;
    try {
        const apiKey = config.monitoringContext?.apiKey;
        const missingConnectionCredentials = apiKey
            ? !hasApiKeyScope({ grantedScopes: apiKey.scopes, requiredScope: 'environment:connections:read_credentials' })
            : null;
        const missingIntegrationCredentials = apiKey
            ? !hasApiKeyScope({ grantedScopes: apiKey.scopes, requiredScope: 'environment:integrations:read_credentials' })
            : null;
        proxyTrackingLogger.log('proxy:base_url_override', {
            ...properties,
            caller_supplied: true,
            has_template: config.baseUrlOverride.includes('${'),
            scope_check_performed: Boolean(apiKey),
            missing_connection_credentials: missingConnectionCredentials,
            missing_integration_credentials: missingIntegrationCredentials,
            would_block: apiKey ? Boolean(missingConnectionCredentials || missingIntegrationCredentials) : null
        });
    } catch {
        // Monitoring must not interrupt an otherwise valid proxy request.
    }
}
