import type { JSONSchema7 } from 'json-schema';

export const JSON_DISPLAY_LIMIT = 250_000;

export interface InputField {
    name: string;
    type: string;
    description?: string;
    required: boolean;
}

export function getInputFields(jsonSchema: JSONSchema7 | null | undefined): InputField[] {
    if (!jsonSchema || typeof jsonSchema !== 'object') return [];
    const props = jsonSchema.properties;
    if (!props) return [];
    const required = Array.isArray(jsonSchema.required) ? jsonSchema.required : [];
    return Object.entries(props).map(([name, def]) => {
        const fieldDef = def as JSONSchema7;
        return {
            name,
            type: Array.isArray(fieldDef.type) ? fieldDef.type[0] || 'string' : fieldDef.type || 'string',
            description: fieldDef.description,
            required: required.includes(name)
        };
    });
}
