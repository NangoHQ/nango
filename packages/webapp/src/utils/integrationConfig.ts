import type { SimplifiedJSONSchema } from '@nangohq/types';

/**
 * Whether an `integration_config` field should be shown/validated given the current field values.
 * Visibility cascades: a field gated by `visible_when` is visible only if its controller is itself
 * visible, so a stale hidden controller can't surface its dependents. Cyclic clauses fail open.
 *
 * NOTE: duplicated from the server resolver (packages/server .../integrationConfig.ts). `@nangohq/types`
 * ships types only, so this small pure helper can't be shared from there — keep the two copies in sync.
 */
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
 * Return only declared, visible integration configuration values.
 * Form-only fields (for example OAuth client credentials) must not be sent as
 * integration configuration because the API validates this object against the
 * provider's declared schema.
 */
export function getVisibleIntegrationConfigValues(
    schema: Record<string, SimplifiedJSONSchema>,
    values: Record<string, string | undefined>
): Record<string, string> {
    return Object.fromEntries(
        Object.keys(schema).flatMap((name) => {
            const value = values[name];
            return value !== undefined && isIntegrationConfigFieldVisible(name, schema, values) ? [[name, value]] : [];
        })
    );
}
