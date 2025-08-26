import type { SchemaModel, StandardSchemaV1 } from './types.js';

/**
 * Type guard to check if a schema follows the Standard Schema V1 specification
 * @param schema - The schema to check
 * @returns True if the schema implements StandardSchema v1
 */
export function isStandardSchemaV1<T = unknown>(schema: unknown): schema is StandardSchemaV1<T> {
    return typeof schema === 'object' && schema !== null && '~standard' in schema;
}

/**
 * Validates a value against a StandardSchema v1 compliant schema
 * @param schema - A StandardSchema v1 compliant validation schema
 * @param value - The value to validate
 * @returns Validation result with success flag, validated data, and potential errors
 * @throws {Error} When schema doesn't implement StandardSchema v1
 * @throws {Error} When schema uses async validation (not supported in synchronous context)
 */
export function validateWithAnySchema<T>(schema: SchemaModel, value: unknown): { success: boolean; data?: T; error?: any } {
    if (!isStandardSchemaV1(schema)) {
        throw new Error('Schema must implement StandardSchema v1 specification');
    }

    const result = schema['~standard'].validate(value);

    // Handle async validation
    if (result instanceof Promise) {
        throw new Error('Async validation is not supported in this context');
    }

    if (result.issues) {
        return { success: false, error: result.issues };
    }

    return { success: true, data: result.value as T };
}

/**
 * Gets the vendor/type of a schema
 * @param schema - A StandardSchema v1 compliant schema
 * @returns The vendor name (e.g., 'zod', 'valibot', 'yup') or 'unknown'
 */
export function getSchemaVendor(schema: SchemaModel): string {
    if (isStandardSchemaV1(schema)) {
        return schema['~standard'].vendor || 'unknown';
    }
    return 'unknown';
}
