import { Err, Ok } from './result.js';

import type { NangoModel, NangoModelField, Result } from '@nangohq/types';
import type { JSONSchema7 } from 'json-schema';

export function nangoModelToJsonSchema(model: NangoModel, models_schema: NangoModel[]): Result<JSONSchema7> {
    try {
        return Ok(nangoModelToJsonSchemaInternal(model, models_schema, new Set()));
    } catch (err) {
        return Err(err as Error);
    }
}

function nangoModelToJsonSchemaInternal(model: NangoModel, models_schema: NangoModel[], visitedModels: Set<string>): JSONSchema7 {
    if (visitedModels.has(model.name)) {
        throw new Error(`Circular reference detected: ${Array.from(visitedModels).join(' -> ')} -> ${model.name}`);
    }

    visitedModels.add(model.name);

    try {
        const properties: Record<string, JSONSchema7> = {};
        const required: string[] = [];

        for (const field of model.fields) {
            const fieldSchema = nangoFieldToJsonSchemaInternal(field, models_schema, visitedModels);
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
    } finally {
        visitedModels.delete(model.name);
    }
}

function nangoFieldToJsonSchemaInternal(field: NangoModelField, models_schema: NangoModel[], visitedModels: Set<string>): JSONSchema7 {
    if (field.array) {
        return {
            type: 'array',
            items: nangoFieldToJsonSchemaInternal({ ...field, array: false }, models_schema, visitedModels)
        };
    }

    if (field.model) {
        if (typeof field.value !== 'string') {
            throw new Error('field is model but value is not a string');
        }

        const modelName = field.value;
        const model = models_schema.find((m) => m.name === modelName);

        if (!model) {
            throw new Error(`Model ${modelName} not found`);
        }

        return nangoModelToJsonSchemaInternal(model, models_schema, visitedModels);
    }

    if (field.union) {
        if (!Array.isArray(field.value)) {
            throw new Error('field is union but value is not an array');
        }

        return {
            oneOf: field.value.map((v) => nangoFieldToJsonSchemaInternal(v, models_schema, visitedModels))
        };
    }

    if (field.value === 'number') {
        return {
            type: 'number'
        };
    } else if (field.value === 'boolean') {
        return {
            type: 'boolean'
        };
    } else if (field.value === 'string') {
        return {
            type: 'string'
        };
    } else if (field.value === 'date') {
        return {
            type: 'integer',
            format: 'date-time'
        };
    }

    return {
        type: 'object',
        additionalProperties: {
            type: 'string'
        }
    };
}
