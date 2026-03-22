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
    return Object.entries(props).flatMap(([name, def]): InputField[] => {
        if (typeof def === 'boolean') {
            // false means the property is explicitly disallowed; true means any value is allowed
            if (!def) return [];
            return [{ name, type: 'string', description: undefined, required: required.includes(name) }];
        }
        const type = Array.isArray(def.type) ? (def.type.find((t) => t !== 'null') ?? def.type[0] ?? 'string') : def.type || 'string';
        return [{ name, type, description: def.description, required: required.includes(name) }];
    });
}
