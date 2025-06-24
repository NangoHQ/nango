import type { NangoModel, NangoModelField } from '@nangohq/types';
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

    for (const field of model.fields || []) {
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

    if (Array.isArray(field.value)) {
        const properties: Record<string, JSONSchema7> = {};
        const required: string[] = [];

        for (const subField of field.value) {
            // It's an array of this field type
            if (subField.name === '0') {
                return nangoFieldToJsonSchema(subField);
            }

            properties[subField.name] = nangoFieldToJsonSchema(subField);
            if (!subField.optional) {
                required.push(subField.name);
            }
        }

        return {
            type: 'object',
            properties,
            ...(required.length > 0 && { required })
        };
    }

    if (field.value === null) {
        return { type: 'null' };
    }

    if (typeof field.value === 'string') {
        if (field.tsType && primitiveTypeMap[field.value]) {
            return primitiveTypeMap[field.value] as JSONSchema7;
        }

        return {
            type: 'string',
            const: field.value
        };
    }

    if (typeof field.value === 'boolean') {
        return {
            type: 'boolean',
            const: field.value
        };
    }

    if (typeof field.value === 'number') {
        return {
            type: 'number',
            const: field.value
        };
    }

    // Fallback to Record<string, string>
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
    char: { type: 'string' },
    varchar: { type: 'string' },
    date: { type: 'string', format: 'date-time' }
};
