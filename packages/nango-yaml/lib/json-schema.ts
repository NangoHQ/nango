import type { LegacySyncModelSchema, NangoModel, NangoModelField } from '@nangohq/types';
import type { JSONSchema7 } from 'json-schema';

/**
 * Converts a list of Nango models to a JSON Schema with all the schemas stored in the definitions property.
 */
export function nangoModelsToJsonSchema(models: NangoModel[]): JSONSchema7 {
    const definitions: Record<string, JSONSchema7> = {};

    for (const model of models) {
        definitions[model.name] = nangoModelToJsonSchema(model);
    }

    return { definitions };
}

function nangoModelToJsonSchema(model: NangoModel): JSONSchema7 {
    const properties: Record<string, JSONSchema7> = {};
    const required: string[] = [];

    for (const field of model.fields) {
        const fieldSchema = nangoFieldToJsonSchema(field);
        properties[field.name] = fieldSchema;

        if (!field.optional) {
            required.push(field.name);
        }
    }

    return {
        type: 'object',
        properties,
        required
    };
}

function nangoFieldToJsonSchema(field: NangoModelField): JSONSchema7 {
    if (field.array) {
        return {
            type: 'array',
            items: nangoFieldToJsonSchema({ ...field, array: false })
        };
    }

    if (field.model) {
        if (typeof field.value !== 'string') {
            throw new Error('field is model but value is not a string');
        }

        const modelName = field.value;
        return {
            $ref: `#/definitions/${modelName}`
        };
    }

    if (field.union) {
        if (!Array.isArray(field.value)) {
            throw new Error('field is union but value is not an array');
        }

        return {
            oneOf: field.value.map((v) => nangoFieldToJsonSchema(v))
        };
    }

    if (typeof field.value === 'string' && primitiveTypeMap[field.value]) {
        return primitiveTypeMap[field.value] as JSONSchema7;
    }

    return {
        type: 'object',
        additionalProperties: {
            type: 'string'
        }
    };
}

const primitiveTypeMap: Record<string, JSONSchema7> = {
    number: { type: 'number' },
    boolean: { type: 'boolean' },
    string: { type: 'string' },
    date: { type: 'string', format: 'date-time' }
};

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
    const properties: Record<string, JSONSchema7> = {};
    const required: string[] = [];
    const fields = Array.isArray(model.fields) ? model.fields : [];
    for (const field of fields) {
        // Optional fields end with '?' or '| undefined'
        const isOptional = /\?$/.test(field.name) || /\|\s*undefined$/.test(field.type);
        const cleanName = field.name.replace(/\?$/, '');
        properties[cleanName] = legacySyncFieldToJsonSchema(field, allModels);
        if (!isOptional) {
            required.push(cleanName);
        }
    }
    return {
        type: 'object',
        properties,
        required
    };
}

function legacySyncFieldToJsonSchema(field: { name: string; type: string }, allModels: LegacySyncModelSchema[]): JSONSchema7 {
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
    // All other types are treated as references
    return { $ref: `#/definitions/${typeStr}` };
}

const legacyPrimitiveTypeMap: Record<string, JSONSchema7> = {
    integer: { type: 'integer' },
    number: { type: 'number' },
    boolean: { type: 'boolean' },
    string: { type: 'string' },
    date: { type: 'string', format: 'date-time' },
    null: { type: 'null' }
};
