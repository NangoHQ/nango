import { Err, Ok } from '@nangohq/utils';

import type { Provider, SimplifiedJSONSchema } from '@nangohq/types';
import type { Result } from '@nangohq/utils';

export interface IntegrationConfigFieldError {
    field: string;
    message: string;
}

export class IntegrationConfigError extends Error {
    fields: IntegrationConfigFieldError[];
    constructor(fields: IntegrationConfigFieldError[]) {
        super(fields.map((f) => f.message).join(', '));
        this.name = 'IntegrationConfigError';
        this.fields = fields;
    }
}

function hasValue(value: string | undefined): value is string {
    return value !== undefined && value !== '';
}

export function isIntegrationConfigFieldVisible(
    field: string,
    schema: Record<string, SimplifiedJSONSchema>,
    values: Record<string, string | undefined>,
    seen = new Set<string>()
): boolean {
    const definition = schema[field];
    if (!definition?.visible_when) {
        return true;
    }
    if (seen.has(field)) {
        return true;
    }
    seen.add(field);

    const { field: controller, equals } = definition.visible_when;
    if (controller in schema && !isIntegrationConfigFieldVisible(controller, schema, values, seen)) {
        return false;
    }
    return values[controller] === equals;
}

/**
 * Resolves the values submitted for a provider's `integration_config` schema: validates them, applies
 * defaults, and returns the cleaned set ready to be merged into the integration's `custom` field.
 *
 * Used for custom integration configuration (e.g. `private-api-generic`). Keys not declared in the
 * schema are rejected (rather than silently dropped) so typos surface as errors.
 */
export function resolveIntegrationConfig(
    provider: Provider,
    submitted: Record<string, string>,
    options?: { patch?: boolean; existing?: Record<string, string> | null | undefined }
): Result<Record<string, string>, IntegrationConfigError> {
    const patch = options?.patch ?? false;
    const schema = provider.integration_config;
    if (!schema) {
        return Err(new IntegrationConfigError([{ field: '_', message: 'This provider does not accept integration configuration' }]));
    }

    const errors: IntegrationConfigFieldError[] = [];
    const values: Record<string, string> = {};

    // Effective values used to evaluate `visible_when`: submitted overrides what's already stored, so a
    // patch that flips a controller (e.g. stsMode) re-evaluates visibility against the new value.
    const effective: Record<string, string | undefined> = { ...(options?.existing ?? {}), ...submitted };

    // Reject keys that are not part of the provider's schema so a typo'd field surfaces instead of being dropped.
    for (const key of Object.keys(submitted)) {
        if (!Object.prototype.hasOwnProperty.call(schema, key)) {
            errors.push({ field: key, message: `Unknown field ${key}` });
        }
    }

    for (const [field, definition] of Object.entries(schema)) {
        // A field gated off by `visible_when` is neither required nor validated — it doesn't apply to
        // this configuration (e.g. built-in AWS credentials when stsMode=custom).
        if (!isIntegrationConfigFieldVisible(field, schema, effective)) {
            continue;
        }

        const provided = field in submitted;
        if (patch && !provided) {
            continue;
        }

        let value = submitted[field];

        if (!hasValue(value) && definition.default_value !== undefined && !patch) {
            value = definition.default_value;
        }

        if (!hasValue(value)) {
            if (!definition.optional) {
                errors.push({ field, message: `${definition.title} is required` });
            } else if (patch) {
                // Explicitly clearing an optional field.
                values[field] = '';
            }
            continue;
        }

        if (definition.enum && definition.enum.length > 0 && !definition.enum.includes(value)) {
            errors.push({ field, message: `${definition.title} must be one of: ${definition.enum.join(', ')}` });
            continue;
        }

        if (definition.pattern) {
            try {
                if (!new RegExp(definition.pattern).test(value)) {
                    errors.push({ field, message: `${definition.title} has an invalid format` });
                    continue;
                }
            } catch {
                // Ignore an invalid pattern in the provider schema rather than block the customer.
            }
        }

        if (definition.format === 'uri') {
            let protocol: string | undefined;
            try {
                protocol = new URL(value).protocol;
            } catch {
                errors.push({ field, message: `${definition.title} must be a valid URL` });
                continue;
            }

            if (protocol !== 'http:' && protocol !== 'https:') {
                errors.push({ field, message: `${definition.title} must be an http(s) URL` });
                continue;
            }
        }

        values[field] = value;
    }

    if (errors.length > 0) {
        return Err(new IntegrationConfigError(errors));
    }

    return Ok(values);
}
