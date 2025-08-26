import { zodToNangoModelField as zodIntrospect } from './zodToNango.js';

import type { StandardSchemaV1 } from '@nangohq/runner-sdk/lib/types.js';
import type { NangoModelField } from '@nangohq/types';

/**
 * Convert a schema to NangoModelField
 *
 * - For schemas with Zod-like introspection (_def property), use rich introspection
 * - For all other Standard Schema implementations, use a simplified approach
 */
export function schemaToNangoModelField(name: string, schema: StandardSchemaV1): NangoModelField {
    // If the schema has introspection capabilities, use them for richer type generation
    if (hasIntrospectionCapabilities(schema)) {
        try {
            return zodIntrospect(name, schema as any);
        } catch (_err) {
            // Introspection failed, fallback to generic approach
            // This is expected for schemas without full introspection support
        }
    }

    // For all Standard Schema implementations without introspection:
    // We can't determine the structure, so use 'any' (validated at runtime)
    return {
        name,
        value: 'any',
        tsType: true,
        optional: isOptionalSchema(schema)
    };
}

function hasIntrospectionCapabilities(schema: any): boolean {
    return schema && typeof schema === 'object' && '_def' in schema;
}

/**
 * Check if a schema accepts undefined values (is optional)
 * Uses the Standard Schema interface, works with all compatible libraries
 */
function isOptionalSchema(schema: StandardSchemaV1): boolean {
    try {
        const validate = schema['~standard'].validate;
        const result = validate(undefined);

        if (result instanceof Promise) {
            return false;
        }

        return !result.issues;
    } catch {
        return false; // If validation throws, it's not optional
    }
}
