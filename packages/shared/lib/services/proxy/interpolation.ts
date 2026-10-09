import { interpolateIfNeeded } from '../../utils/utils.js';

import type { ApplicationConstructedProxyConfiguration, ConnectionForProxy, ProxyInterpolationEvent } from '@nangohq/types';

/** Observe secret substitutions without changing interpolation behavior or exposing their values. */
export function interpolateProxyTemplate(
    template: string,
    replacers: Record<string, any>,
    config: ApplicationConstructedProxyConfiguration,
    connection: ConnectionForProxy,
    location: ProxyInterpolationEvent['location']
): string {
    if (!config.onSecretInterpolation) {
        return interpolateIfNeeded(template, replacers);
    }

    const fieldsByType = new Map<ProxyInterpolationEvent['credentialType'], Set<string>>();
    const result = interpolateIfNeeded(template, replacers, (expression) => {
        let credentialType: ProxyInterpolationEvent['credentialType'] | undefined;
        if (expression.startsWith('connectionConfig.') || expression.startsWith('connection_config.')) {
            const field = expression.replace(/^connection(?:Config|_config)\./, '');
            if (
                Object.entries(config.provider.connection_config ?? {}).some(
                    ([key, definition]) => definition.secret && (field === key || field.startsWith(`${key}.`))
                )
            ) {
                credentialType = 'connection_config';
            }
        } else if (location === 'provider_header' && connection.credentials.type === 'OAUTH2' && ['clientId', 'clientSecret'].includes(expression)) {
            credentialType = 'integration_credentials';
        } else if (
            expression.startsWith('credentials.') ||
            Object.hasOwn(connection.credentials, expression.split('.')[0] ?? '') ||
            expression === 'accessToken'
        ) {
            credentialType = 'connection_credentials';
        }

        if (credentialType) {
            const fields = fieldsByType.get(credentialType) ?? new Set<string>();
            fields.add(expression);
            fieldsByType.set(credentialType, fields);
        }
    });

    for (const [credentialType, fields] of fieldsByType) {
        try {
            config.onSecretInterpolation({ location, credentialType, fields: [...fields].sort() });
        } catch {
            // Monitoring must not interrupt an otherwise valid proxy request.
        }
    }
    return result;
}
