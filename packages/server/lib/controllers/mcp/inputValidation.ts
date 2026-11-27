import { Ajv } from 'ajv';
import addFormats from 'ajv-formats';

import { Err, Ok } from '@nangohq/utils';

import type { ResolvedLegacyAction } from '@nangohq/shared';
import type { Result } from '@nangohq/types';
import type { AnySchema, ValidateFunction } from 'ajv';

// Legacy schemas are less strict than new-style function schemas. Validate values
// without coercing types, adding defaults, or removing unknown properties.
const ajv = new Ajv({ strict: false, allErrors: false, formats: { e164: /^\+[1-9]\d{1,14}$/ } });
// @ts-expect-error ajv-formats CommonJS default export is callable at runtime but mis-typed under NodeNext
addFormats(ajv);
const validators = new Map<string, ValidateFunction>();
const MAX_VALIDATORS = 1000;
const TYPE_MISMATCH_KEYWORDS = new Set(['type', 'anyOf', 'oneOf']);

export class McpInputValidationError extends Error {
    constructor(
        readonly code: 'invalid_input' | 'invalid_schema',
        message: string,
        options?: ErrorOptions
    ) {
        super(message, options);
    }
}

export function validateMcpActionInput(action: Exclude<ResolvedLegacyAction, { kind: 'missing' }>, input: unknown): Result<void, McpInputValidationError> {
    const model = action.kind === 'catalog' ? action.tool.input : action.config.input;
    const schema = action.kind === 'catalog' ? action.tool.jsonSchema : action.config.models_json_schema;
    // Older deployments may not have a JSON schema. Keep their existing behavior.
    if (!model || !schema) {
        return Ok(undefined);
    }
    // Only a JSON-encoded string sent in place of structured input is rejected.
    // Anything else reaches the action as it does over REST.
    if (typeof input !== 'string') {
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

        // A string the schema accepts as a string type passes, even when it
        // fails a narrower constraint such as a pattern or an enum.
        // Ajv also reports oneOf when several branches match, which is not a mismatch.
        const isTypeMismatch =
            !validate(input) &&
            (validate.errors ?? []).every(
                (error) => TYPE_MISMATCH_KEYWORDS.has(error.keyword) && !(error.keyword === 'oneOf' && error.params['passingSchemas'] !== null)
            );
        if (isTypeMismatch) {
            return Err(new McpInputValidationError('invalid_input', ajv.errorsText(validate.errors, { dataVar: 'input' })));
        }
        return Ok(undefined);
    } catch (err) {
        return Err(new McpInputValidationError('invalid_schema', 'Failed to validate the action input schema', { cause: err }));
    }
}
