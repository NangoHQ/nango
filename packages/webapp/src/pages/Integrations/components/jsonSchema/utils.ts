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

export function isNullSchema(schema: JSONSchema7 | null): boolean {
    return schema?.type === 'null';
}

export function isOneOfSchema(schema: JSONSchema7 | null): boolean {
    return schema?.oneOf !== undefined;
}

export function isAnyOfSchema(schema: JSONSchema7 | null): boolean {
    return schema?.anyOf !== undefined;
}

export function isObjectWithNoProperties(schema: JSONSchema7 | null): boolean {
    return isObjectSchema(schema) && !schema?.properties && !schema?.additionalProperties;
}

export function typeToString(schema: JSONSchema7 | null, isArray: boolean): string {
    if (!schema) {
        return 'unknown';
    }
    const { type, anyOf, oneOf, enum: enumValues, const: constValue } = schema;
    if (!type && !anyOf && !oneOf) {
        return 'unknown';
    }

    if (anyOf || oneOf) {
        const schemas = anyOf || oneOf || [];
        const types = schemas.map((s) => typeToString(s as JSONSchema7, false)).join(' | ');
        return isArray ? `(${types})[]` : types;
    }

    if (Array.isArray(type)) {
        const types = type.map((t) => t.toString()).join(' | ');
        if (isArray) {
            return `(${types})${isArray ? '[]' : ''}`;
        }
        return types;
    }

    if (enumValues && isPrimitiveSchema(schema)) {
        if (type === 'string') {
            return enumValues.map((e) => `"${String(e as string)}"`).join(' | ');
        }
        return enumValues.map((e) => String(e as number | boolean)).join(' | ');
    }

    if (constValue) {
        return JSON.stringify(constValue);
    }

    return `${type}${isArray ? '[]' : ''}`;
}
