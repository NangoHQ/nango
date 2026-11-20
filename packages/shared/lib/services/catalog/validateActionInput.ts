import { Ajv } from 'ajv';
import addFormats from 'ajv-formats';

import { Err, Ok } from '@nangohq/utils';

import type { ResolvedLegacyAction } from './resolveLegacyAction.js';
import type { Result } from '@nangohq/types';
import type { AnySchema, ValidateFunction } from 'ajv';

// Legacy schemas are less strict than new-style function schemas. Validate values
// without coercing types, adding defaults, or removing unknown properties.
const ajv = new Ajv({ strict: false, allErrors: false, formats: { e164: /^\+[1-9]\d{1,14}$/ } });
// @ts-expect-error ajv-formats CommonJS default export is callable at runtime but mis-typed under NodeNext
addFormats(ajv);
const validators = new Map<string, ValidateFunction>();
const MAX_VALIDATORS = 1000;

export class ActionInputValidationError extends Error {
    constructor(
        readonly code: 'invalid_input' | 'invalid_schema',
        message: string,
        options?: ErrorOptions
    ) {
        super(message, options);
    }
}

export function validateActionInput(action: Exclude<ResolvedLegacyAction, { kind: 'missing' }>, input: unknown): Result<void, ActionInputValidationError> {
    const model = action.kind === 'catalog' ? action.tool.input : action.config.input;
    const schema = action.kind === 'catalog' ? action.tool.jsonSchema : action.config.models_json_schema;
    // Older deployments may not have a JSON schema. Keep their existing behavior.
    if (!model || !schema) {
        return Ok(undefined);
    }

    try {
        const key =
            action.kind === 'catalog'
                ? `catalog:${action.tool.sourceLocation}:${action.tool.version}`
                : `deployed:${action.config.id}:${action.config.version}`;
        let validate = validators.get(key);
        if (validate) {
            validators.delete(key);
        } else {
            const ref = `#/definitions/${model.replace(/~/g, '~0').replace(/\//g, '~1')}`;
            // Remove Ajv's own cache entry; this bounded cache owns the validator.
            const definition = schema.definitions?.[model];
            // Generated models containing z.json() embed definitions locally,
            // while their references are absolute to the schema document root.
            const inputSchema = {
                ...schema,
                definitions: { ...schema.definitions, ...(typeof definition === 'object' ? definition.definitions : {}) },
                $ref: ref
            } as AnySchema;
            try {
                validate = ajv.compile(inputSchema);
            } finally {
                ajv.removeSchema(inputSchema);
            }
        }
        validators.set(key, validate);
        if (validators.size > MAX_VALIDATORS) {
            const oldest = validators.keys().next().value;
            if (oldest !== undefined) validators.delete(oldest);
        }

        // MCP clients send {} for omitted arguments. Actions with null schemas
        // represent no input, while optional object schemas can accept {}. Keep
        // the original value unchanged when handing it to the runner.
        const omittedInput = input === undefined || (typeof input === 'object' && input !== null && !Array.isArray(input) && Object.keys(input).length === 0);
        const valid = omittedInput ? validate(null) || validate(input ?? {}) : validate(input);
        if (!valid) {
            return Err(
                new ActionInputValidationError(
                    'invalid_input',
                    `Invalid input: ${ajv.errorsText(validate.errors, { dataVar: 'input' })}. Pass a JSON value matching the input schema.`
                )
            );
        }
        return Ok(undefined);
    } catch (err) {
        return Err(new ActionInputValidationError('invalid_schema', 'Failed to validate the action input schema', { cause: err }));
    }
}
