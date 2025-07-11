import type { JSONSchema7 } from 'json-schema';

export function getDefinition(name: string, rootSchema: JSONSchema7): JSONSchema7 | null {
    const schema = rootSchema.definitions?.[name];
    if (!schema || typeof schema !== 'object') {
        return null;
    }
    return schema;
}

export function isPrimitiveType(schema: JSONSchema7 | null): boolean {
    return typeof schema?.type === 'string' && ['string', 'number', 'boolean', 'integer'].includes(schema.type);
}
