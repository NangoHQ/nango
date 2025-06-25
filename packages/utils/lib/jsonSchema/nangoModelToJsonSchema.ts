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
    let dynamicField: NangoModelField | null = null;

    for (const field of model.fields || []) {
        if (field.dynamic && field.name === '__string') {
            dynamicField = field;
            continue;
        }

        const fieldSchema = nangoFieldToJsonSchema(field);
        properties[field.name] = fieldSchema;

        if (!field.optional) {
            required.push(field.name);
        }
    }

    return {
        type: 'object',
        ...(Object.keys(properties).length > 0 && { properties }),
        ...(required.length > 0 && { required }),
        ...(dynamicField && { additionalProperties: nangoFieldToJsonSchema(dynamicField) })
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
        let dynamicField: NangoModelField | null = null;

        for (const subField of field.value) {
            // It's an array of this field type
            if (subField.name === '0') {
                return nangoFieldToJsonSchema(subField);
            }

            if (subField.dynamic && subField.name === '__string') {
                dynamicField = subField;
                continue;
            }

            properties[subField.name] = nangoFieldToJsonSchema(subField);
            if (!subField.optional) {
                required.push(subField.name);
            }
        }

        return {
            type: 'object',
            ...(Object.keys(properties).length > 0 && { properties }),
            ...(required.length > 0 && { required }),
            ...(dynamicField && { additionalProperties: nangoFieldToJsonSchema(dynamicField) })
        };
    }

    if (field.value === 'any[]') {
        return {
            type: 'array',
            items: {} // Matching CLI behavior for this...
        };
    }

    if (field.value === null) {
        return { type: 'null' };
    }

    if (field.tsType && typeof field.value === 'string' && tsTypeMap[field.value]) {
        return tsTypeMap[field.value] as JSONSchema7;
    }

    if (typeof field.value === 'string') {
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

const tsTypeMap: Record<string, JSONSchema7> = {
    number: { type: 'number' },
    bigint: { type: 'number' },
    boolean: { type: 'boolean' },
    string: { type: 'string' },
    date: { type: 'string', format: 'date-time' },
    undefined: { type: 'null' }, // There's no json schema mapping for this.
    'Record<string, any>': { type: 'object' }
};
