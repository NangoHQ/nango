import { z } from 'zod';

import type { JSONSchema7 } from 'json-schema';

function zodSchemaToJsonSchema(schema: z.ZodTypeAny): JSONSchema7 | null {
    if (schema.constructor.name === 'ZodVoid') {
        return { type: 'null' };
    }

    const jsonSchema = z.toJSONSchema(schema, {
        target: 'draft-7',
        unrepresentable: 'any',
        override(ctx) {
            // Override date behavior
            if (ctx.zodSchema._zod.def.type === 'date') {
                ctx.jsonSchema.type = 'string';
                (ctx.jsonSchema as Record<string, unknown>)['format'] = 'date-time';
            }
        }
    }) as JSONSchema7;

    // Remove schema version from individual models
    delete jsonSchema['$schema'];

    return jsonSchema;
}

/**
 * Converts a map of named Zod schemas into a single JSON Schema document
 * with a `definitions` block containing each model.
 *
 * Zod schemas that resolve to `void` are silently skipped.
 * @example
 * const schema = buildJsonSchemaDefinitionsFromZodModels({
 *   User: z.object({ id: z.string(), age: z.number() }),
 *   Order: z.object({ orderId: z.string(), total: z.number() }),
 * });
 * // { $schema: 'http://json-schema.org/draft-07/schema#', definitions: { User: {...}, Order: {...} } }
 */
export function buildJsonSchemaDefinitionsFromZodModels(models: Record<string, z.ZodTypeAny>): JSONSchema7 {
    const definitions: Record<string, JSONSchema7> = {};

    for (const [name, model] of Object.entries(models)) {
        const jsonSchema = zodSchemaToJsonSchema(model);
        if (jsonSchema) {
            definitions[name] = jsonSchema;
        }
    }

    return {
        $schema: 'http://json-schema.org/draft-07/schema#',
        definitions
    };
}
