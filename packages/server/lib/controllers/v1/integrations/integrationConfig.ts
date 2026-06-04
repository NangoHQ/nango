import { Err, Ok } from '@nangohq/utils';

import type { Provider } from '@nangohq/types';
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

/**
 * Validates the values submitted for a provider's `integration_config` schema and returns the
 * cleaned set of values (with defaults applied) ready to be merged into the integration's `custom` field.
 *
 * Used for custom integration configuration (e.g. `private-api-generic`). Unknown keys are dropped.
 */
export function validateIntegrationConfig(
    provider: Provider,
    submitted: Record<string, string>,
    options?: { patch?: boolean }
): Result<Record<string, string>, IntegrationConfigError> {
    const patch = options?.patch ?? false;
    const schema = provider.integration_config;
    if (!schema) {
        return Err(new IntegrationConfigError([{ field: '_', message: 'This provider does not accept integration configuration' }]));
    }

    const errors: IntegrationConfigFieldError[] = [];
    const values: Record<string, string> = {};

    for (const [field, definition] of Object.entries(schema)) {
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
            try {
                new URL(value);
            } catch {
                errors.push({ field, message: `${definition.title} must be a valid URL` });
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
