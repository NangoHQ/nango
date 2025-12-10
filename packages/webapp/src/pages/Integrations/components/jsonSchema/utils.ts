import type { JSONSchema7 } from 'json-schema';

export function isPrimitiveSchema(schema: JSONSchema7 | null): boolean {
    return typeof schema?.type === 'string' && ['string', 'number', 'boolean', 'integer'].includes(schema.type);
}

export function isObjectSchema(schema: JSONSchema7 | null): boolean {
    return schema?.type === 'object';
}

export function isArraySchema(schema: JSONSchema7 | null): boolean {
    return schema?.type === 'array';
}

export function isComplexSchema(schema: JSONSchema7 | null): boolean {
    return isObjectSchema(schema) || isArraySchema(schema);
}
