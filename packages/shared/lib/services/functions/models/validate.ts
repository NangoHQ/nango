import { Ajv } from 'ajv';
import addFormats from 'ajv-formats';

import { Err, Ok } from '@nangohq/utils';

import type { DBFunctionConfigVersion, ValidationError } from '@nangohq/types';
import type { Result } from '@nangohq/utils';
import type { AnySchema, ErrorObject, ValidateFunction } from 'ajv';
import type { JsonValue } from 'type-fest';

export const MAX_VALIDATOR_CACHE_SIZE = 1000;

const ajv = new Ajv({
    // We avoid collecting all errors for performance reasons
    // as well as preventing huge malicious inputs from causing OOM errors
    // Important: Only the first validation error will be returned,
    // making the error reporting less comprehensive for the users
    // but it is a trade-off for performance and security.
    allErrors: false,
    strict: true
});
// @ts-expect-error ajv-formats CommonJS default export is callable at runtime but mis-typed under NodeNext
addFormats(ajv);

// ajv owns the schema cache,
// but we maintain a LRU cache of version id to validator status
// to avoid re-compiling schemas unnecessarily and evict the oldest entries.
const validatorCache = new Map<number, 'valid' | 'invalid'>();

export function clearFunctionInputValidatorCache(): void {
    for (const [versionId, status] of validatorCache) {
        if (status === 'valid') {
            ajv.removeSchema(validatorSchemaId(versionId));
        }
    }
    validatorCache.clear();
}

export class FunctionInputValidationError extends Error {
    public validationErrors: ValidationError[];

    constructor(message: string, errors: ValidationError[] = []) {
        super(message);
        this.name = 'function_input_validation_error';
        this.validationErrors = errors;
    }
}

export function validateFunctionInput(version: DBFunctionConfigVersion, input: unknown): Result<JsonValue, FunctionInputValidationError> {
    if (!version.input_schema_ref) {
        return input === undefined ? Ok(null) : Err(new FunctionInputValidationError('unexpected_function_input'));
    }

    try {
        const validate = getValidator(version);
        if (!validate) {
            return Err(new FunctionInputValidationError('invalid_function_input_schema'));
        }

        const normalizedInput = input === undefined ? null : input;
        const valid = validate(normalizedInput);
        if (!valid) {
            return Err(new FunctionInputValidationError('invalid_function_input', toValidationErrors(validate.errors || [])));
        }
        return Ok(normalizedInput);
    } catch (_err) {
        return Err(new FunctionInputValidationError('invalid_function_input_schema'));
    }
}

function getValidator(version: DBFunctionConfigVersion): ValidateFunction<JsonValue> | null {
    const cached = validatorCache.get(version.id);
    if (cached) {
        // Re-insert the cached validator to mark it as recently used
        validatorCache.delete(version.id);
        validatorCache.set(version.id, cached);

        // If the cached validator is marked as invalid,
        // return null to indicate that validation cannot proceed
        if (cached === 'invalid') {
            return null;
        }

        // If the cached validator is marked as valid,
        // retrieve it from Ajv and return it
        const validate = ajv.getSchema<JsonValue>(validatorSchemaId(version.id));
        if (validate) {
            return validate;
        }

        // If the cached validator is marked as valid but not found in Ajv,
        // remove it from the cache and proceed to recompile it
        validatorCache.delete(version.id);
    }

    const schemaId = validatorSchemaId(version.id);
    try {
        ajv.addSchema({ ...version.json_schema, $id: schemaId, $ref: version.input_schema_ref } as AnySchema);
        const validate = ajv.getSchema<JsonValue>(schemaId);
        if (!validate) {
            throw new Error('failed_to_compile_function_input_schema');
        }

        validatorCache.set(version.id, 'valid');
        return validate;
    } catch {
        ajv.removeSchema(schemaId);
        validatorCache.set(version.id, 'invalid');
        return null;
    } finally {
        tryEvictValidator();
    }
}

function validatorSchemaId(versionId: number): string {
    return `nango:function:input:${versionId}`;
}

function tryEvictValidator(): void {
    if (validatorCache.size <= MAX_VALIDATOR_CACHE_SIZE) {
        return;
    }

    const oldest = validatorCache.entries().next().value;
    if (!oldest) {
        return;
    }

    const [versionId, status] = oldest;
    validatorCache.delete(versionId);
    if (status === 'valid') {
        ajv.removeSchema(validatorSchemaId(versionId));
    }
}

function toValidationErrors(errors: ErrorObject[]): ValidationError[] {
    return errors.map((error) => {
        const path = error.instancePath
            ? error.instancePath
                  .slice(1)
                  .split('/')
                  .map((part) => part.replace(/~1/g, '/').replace(/~0/g, '~'))
            : [];

        const property: unknown =
            error.keyword === 'required'
                ? error.params['missingProperty']
                : error.keyword === 'additionalProperties'
                  ? error.params['additionalProperty']
                  : undefined;
        if (typeof property === 'string') {
            path.push(property);
        }

        return {
            code: error.keyword,
            message: error.message || 'Invalid input',
            path
        };
    });
}
