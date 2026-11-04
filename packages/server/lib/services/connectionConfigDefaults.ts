import * as z from 'zod';

import { getProvider } from '@nangohq/providers';

import type { IntegrationConfig, SimplifiedJSONSchema } from '@nangohq/types';

const formats: Record<NonNullable<SimplifiedJSONSchema['format']>, { label: string; isValid: (value: string) => boolean }> = {
    hostname: { label: 'hostname', isValid: (value) => /^[a-zA-Z0-9.-]+$/.test(value) },
    uuid: { label: 'UUID', isValid: (value) => z.uuid().safeParse(value).success },
    uri: { label: 'URL', isValid: (value) => z.url().safeParse(value).success },
    email: { label: 'email address', isValid: (value) => z.email().safeParse(value).success }
};

/**
 * Validates the `connection_config` a connect session presets for each integration. Connect UI hides
 * every field the session presets, so an invalid value leaves the end user with a form they can neither
 * see nor correct. The rules mirror `jsonSchemaToZod` in Connect UI so both agree on what is valid.
 */
export function validateConnectionConfigDefaults(
    connectionConfigByIntegration: Record<string, Record<string, unknown> | undefined>,
    integrations: Pick<IntegrationConfig, 'unique_key' | 'provider'>[]
): z.core.$ZodIssue[] {
    const issues: z.core.$ZodIssue[] = [];

    for (const [integrationId, connectionConfig] of Object.entries(connectionConfigByIntegration)) {
        const integration = integrations.find((candidate) => candidate.unique_key === integrationId);
        const schema = integration ? getProvider(integration.provider)?.connection_config : undefined;
        if (!schema || !connectionConfig) {
            continue;
        }

        for (const [field, value] of Object.entries(connectionConfig)) {
            const definition = schema[field];
            // Undeclared keys are forwarded untouched (oauth_scopes_override, external_id, the OAuth
            // credential overrides), so there is no schema to hold them to.
            if (!definition || definition.hidden) {
                continue;
            }

            const message = validate(definition, value);
            if (message) {
                issues.push({
                    code: 'custom',
                    message,
                    input: value,
                    path: ['integrations_config_defaults', integrationId, 'connection_config', field]
                });
            }
        }
    }

    return issues;
}

function validate(definition: SimplifiedJSONSchema, value: unknown): string | null {
    if (typeof value !== 'string') {
        return `${definition.title} must be a string`;
    }

    if (definition.optional && value === '') {
        return null;
    }

    if (definition.enum && definition.enum.length > 0) {
        return definition.enum.includes(value) ? null : `${definition.title} must be one of: ${definition.enum.join(', ')}`;
    }

    const format = definition.format ? formats[definition.format] : undefined;
    if (format) {
        if (!format.isValid(value)) {
            return `${definition.title} must be a valid ${format.label}`;
        }
    } else if (value === '' && definition.default_value === undefined) {
        // A default_value only waives the requiredness, never the checks below.
        return `${definition.title} cannot be empty`;
    }

    if (definition.pattern) {
        try {
            if (!new RegExp(definition.pattern).test(value)) {
                return `${definition.title} has an invalid format`;
            }
        } catch {
            // Ignore an invalid pattern in the provider schema rather than block the caller.
        }
    }

    return null;
}
