import type { LegacySyncModelSchema } from '@nangohq/types';
import type { JSONSchema7 } from 'json-schema';

/**
 * Converts a list of LegacySyncModelSchema to a JSON Schema with all the schemas stored in the definitions property.
 * @param models Array of LegacySyncModelSchema
 */
export function legacySyncModelsToJsonSchema(models: LegacySyncModelSchema[]): JSONSchema7 {
    const definitions: Record<string, JSONSchema7> = {};
    for (const model of models) {
        definitions[model.name] = legacySyncModelToJsonSchema(model, models);
    }
    return { definitions };
}

function legacySyncModelToJsonSchema(model: LegacySyncModelSchema, allModels: LegacySyncModelSchema[]): JSONSchema7 {
    const properties = new Map<string, JSONSchema7>();
    const required = new Set<string>();

    const fields = Array.isArray(model.fields) ? model.fields : [];

    for (const field of fields) {
        // Optional fields end with '?' or '| undefined'
        const isOptional = /\?$/.test(field.name) || (typeof field.type === 'string' && /\|\s*undefined$/.test(field.type));
        // Remove the optional marker.
        const cleanName = field.name.replace(/\?$/, '');

        const nameChunks = cleanName.split('.');
        // Handling nested fields represented by a dot in the name.
        if (nameChunks.length > 1) {
            const parentName = nameChunks.shift()!;
            const rest = nameChunks.join('.');

            // We call this function recusively, but without the parent name. Then we merge resulting object schemas.
            const schema = legacySyncModelToJsonSchema({ name: '', fields: [{ ...field, name: rest }] }, allModels);

            if (properties.has(parentName)) {
                properties.set(parentName, mergeObjects(properties.get(parentName)!, schema));
            } else {
                properties.set(parentName, schema);
            }

            if (!isOptional) {
                required.add(parentName);
            }

            continue;
        }

        properties.set(cleanName, legacySyncFieldToJsonSchema(field, allModels));

        if (!isOptional) {
            required.add(cleanName);
        }
    }

    return {
        type: 'object',
        properties: Object.fromEntries(properties),
        required: Array.from(required)
    };
}

function legacySyncFieldToJsonSchema(field: { name: string; type: string }, allModels: LegacySyncModelSchema[]): JSONSchema7 {
    // While our typescript definition defines this as a string, we have many legacy models in the database
    // where this is an object or array describing submodels.
    if (typeof field.type !== 'string') {
        if (Array.isArray(field.type)) {
            if ((field.type as unknown[]).length > 1) {
                return {
                    type: 'array',
                    items: {
                        oneOf: (field.type as unknown[]).map((t) =>
                            legacySyncModelToJsonSchema({ name: '', fields: objectToFields(t as Record<string, string>) }, allModels)
                        )
                    }
                };
            }
            if ((field.type as unknown[]).length === 0) {
                return {
                    type: 'array',
                    items: {}
                };
            }
            return {
                type: 'array',
                items: legacySyncModelToJsonSchema({ name: '', fields: objectToFields(field.type[0] as Record<string, string>) }, allModels)
            };
        }

        return legacySyncModelToJsonSchema({ name: '', fields: objectToFields(field.type as Record<string, string>) }, allModels);
    }

    let typeStr = field.type?.trim() ?? '';
    // Handle optional
    typeStr = typeStr.replace(/\|\s*undefined$/, '').trim();
    // Handle union
    if (typeStr.includes('|')) {
        const types = typeStr
            .split('|')
            .map((t) => t.trim())
            .filter((t) => t !== 'undefined');
        return {
            oneOf: types.map((t) => legacySyncTypeToJsonSchema(t, allModels))
        };
    }
    return legacySyncTypeToJsonSchema(typeStr, allModels);
}

function legacySyncTypeToJsonSchema(typeStr: string, allModels: LegacySyncModelSchema[]): JSONSchema7 {
    // Array type
    const arrayMatch = typeStr.match(/^(.*)\[\]$/);
    if (arrayMatch && typeof arrayMatch[1] === 'string') {
        const itemType = arrayMatch[1].trim();
        return {
            type: 'array',
            items: legacySyncTypeToJsonSchema(itemType, allModels)
        };
    }

    // Primitive types
    if (legacyPrimitiveTypeMap[typeStr]) {
        return legacyPrimitiveTypeMap[typeStr];
    }

    if (allModels.find((m) => m.name === typeStr)) {
        return { $ref: `#/definitions/${typeStr}` };
    }

    return { type: 'string', const: typeStr };
}

const legacyPrimitiveTypeMap: Record<string, JSONSchema7> = {
    integer: { type: 'integer' },
    int: { type: 'integer' },
    float: { type: 'number' },
    number: { type: 'number' },
    boolean: { type: 'boolean' },
    bool: { type: 'boolean' },
    true: { type: 'boolean', const: true },
    false: { type: 'boolean', const: false },
    string: { type: 'string' },
    char: { type: 'string' },
    varchar: { type: 'string' },
    date: { type: 'string', format: 'date-time' },
    null: { type: 'null' },
    undefined: { type: 'null' },
    any: {},
    object: { type: 'object' },
    array: { type: 'array', items: {} }
};

function objectToFields(object: Record<string, string>): LegacySyncModelSchema['fields'] {
    const fields: LegacySyncModelSchema['fields'] = [];
    for (const [key, value] of Object.entries(object)) {
        fields.push({ name: key, type: value });
    }
    return fields;
}

function mergeObjects(a: JSONSchema7, b: JSONSchema7): JSONSchema7 {
    // If this happens it's invalid anyway.
    if (a.type !== 'object' || b.type !== 'object') {
        return a;
    }

    return {
        ...a,
        properties: { ...a.properties, ...b.properties },
        required: [...(a.required || []), ...(b.required || [])]
    };
}
