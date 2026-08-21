import { Ajv } from 'ajv';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { clearFunctionInputValidatorCache, MAX_VALIDATOR_CACHE_SIZE, validateFunctionInput } from './validate.js';

import type { DBFunctionConfigVersion } from '@nangohq/types';

const now = new Date('2026-01-01T00:00:00.000Z');

const version = {
    id: 1,
    function_config_id: 1,
    description: 'Test function',
    file_location: 'functions/github/test',
    version: '1',
    source: 'repo',
    trigger: { kind: 'none' },
    requires: { connection: true, outbound: false, invoke: false },
    capabilities: { usesRecords: false, usesOutbound: false, usesCheckpoints: false, usesMetadata: false, usesInvoke: false },
    limits: { concurrency: { perConnection: 'max' } },
    input_schema_ref: '#/definitions/Input',
    output_schema_ref: null,
    model_schema_refs: [],
    metadata_schema_ref: null,
    checkpoint_schema_ref: null,
    json_schema: {
        definitions: {
            Input: {
                type: 'object',
                properties: { user: { $ref: '#/definitions/User' } },
                required: ['user'],
                additionalProperties: false
            },
            User: {
                type: 'object',
                properties: { id: { type: 'string' } },
                required: ['id'],
                additionalProperties: false
            }
        }
    },
    created_at: now,
    updated_at: now,
    deleted_at: null
} satisfies DBFunctionConfigVersion;

describe('validateFunctionInput', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        clearFunctionInputValidatorCache();
    });

    it('validates input against the referenced definition', () => {
        const input = { user: { id: 'user-1' } };

        const result = validateFunctionInput(version, input);

        expect(result.unwrap()).toBe(input);
    });

    it('returns the first JSON schema validation error', () => {
        const result = validateFunctionInput(version, { user: { id: 1, unexpected: true }, unexpected: true });

        expect(result.isErr()).toBe(true);
        if (result.isOk()) return;
        expect(result.error.message).toBe('invalid_function_input');
        expect(result.error.validationErrors).toStrictEqual([
            { code: 'additionalProperties', message: 'must NOT have additional properties', path: ['unexpected'] }
        ]);
    });

    it('validates JSON schema formats', () => {
        const formattedVersion: DBFunctionConfigVersion = {
            ...version,
            id: 2,
            json_schema: {
                definitions: {
                    Input: {
                        type: 'object',
                        properties: { url: { type: 'string', format: 'uri' } },
                        required: ['url'],
                        additionalProperties: false
                    }
                }
            }
        };

        const valid = validateFunctionInput(formattedVersion, { url: 'https://example.com' });
        expect(valid.unwrap()).toStrictEqual({ url: 'https://example.com' });

        const invalid = validateFunctionInput(formattedVersion, { url: 'not-a-url' });
        expect(invalid.isErr()).toBe(true);
        if (invalid.isOk()) return;
        expect(invalid.error.validationErrors).toContainEqual({ code: 'format', message: 'must match format "uri"', path: ['url'] });
    });

    it('accepts omitted input when the function has no input schema', () => {
        const result = validateFunctionInput({ ...version, input_schema_ref: null }, undefined);

        expect(result.unwrap()).toBeNull();
    });

    it.each([{}, null, false])('rejects provided input when the function has no input schema: %j', (input) => {
        const result = validateFunctionInput({ ...version, input_schema_ref: null }, input);

        expect(result.isErr()).toBe(true);
        if (result.isOk()) return;
        expect(result.error.message).toBe('unexpected_function_input');
        expect(result.error.validationErrors).toStrictEqual([]);
    });

    it('returns an error when the input schema reference cannot be compiled', () => {
        const result = validateFunctionInput({ ...version, id: 3, input_schema_ref: '#/definitions/Missing' }, {});

        expect(result.isErr()).toBe(true);
        if (result.isOk()) return;
        expect(result.error.name).toBe('function_input_validation_error');
        expect(result.error.message).toBe('invalid_function_input_schema');
        expect(result.error.validationErrors).toStrictEqual([]);
    });

    it('validates omitted input against the input schema', () => {
        const result = validateFunctionInput(version, undefined);

        expect(result.isErr()).toBe(true);
        if (result.isOk()) return;
        expect(result.error.message).toBe('invalid_function_input');
        expect(result.error.validationErrors).toContainEqual({ code: 'type', message: 'must be object', path: [] });
    });

    it('validates falsy input values', () => {
        const booleanVersion: DBFunctionConfigVersion = {
            ...version,
            id: 4,
            json_schema: { definitions: { Input: { type: 'boolean' } } }
        };

        const result = validateFunctionInput(booleanVersion, false);

        expect(result.unwrap()).toBe(false);
    });

    it('reuses the compiled validator for a function version', () => {
        const addSchema = vi.spyOn(Ajv.prototype, 'addSchema');

        expect(validateFunctionInput(version, { user: { id: 'user-1' } }).isOk()).toBe(true);
        expect(validateFunctionInput(version, { user: { id: 'user-2' } }).isOk()).toBe(true);

        expect(addSchema).toHaveBeenCalledOnce();
    });

    it('caches schema compilation failures', () => {
        const addSchema = vi.spyOn(Ajv.prototype, 'addSchema');
        const invalidVersion = { ...version, id: 5, input_schema_ref: '#/definitions/Missing' };

        expect(validateFunctionInput(invalidVersion, {}).isErr()).toBe(true);
        expect(validateFunctionInput(invalidVersion, {}).isErr()).toBe(true);

        expect(addSchema).toHaveBeenCalledOnce();
    });

    it('evicts the least recently used validator', () => {
        // Spy on Ajv.addSchema to count how many times a schema is compiled
        const addSchema = vi.spyOn(Ajv.prototype, 'addSchema');

        // Compile and cache 1000 validators
        for (let id = 0; id < MAX_VALIDATOR_CACHE_SIZE; id++) {
            expect(validateFunctionInput({ ...version, id }, { user: { id: 'user-1' } }).isOk()).toBe(true);
        }
        expect(addSchema).toHaveBeenCalledTimes(MAX_VALIDATOR_CACHE_SIZE);

        // Re-calling version 0 should use the cached validator,
        // not trigger a new schema compilation,
        // and mark version 0 as recently used.
        expect(validateFunctionInput({ ...version, id: 0 }, { user: { id: 'user-1' } }).isOk()).toBe(true);
        expect(addSchema).toHaveBeenCalledTimes(MAX_VALIDATOR_CACHE_SIZE);

        // Overflow the cache with a new version
        // This should evict version 1, which was the least recently used.
        expect(validateFunctionInput({ ...version, id: 123456 }, { user: { id: 'user-1' } }).isOk()).toBe(true);
        expect(addSchema).toHaveBeenCalledTimes(MAX_VALIDATOR_CACHE_SIZE + 1);

        // Version 1 was least recently used, so re-calling it registers it again.
        expect(validateFunctionInput({ ...version, id: 1 }, { user: { id: 'user-1' } }).isOk()).toBe(true);
        expect(addSchema).toHaveBeenCalledTimes(MAX_VALIDATOR_CACHE_SIZE + 2);
    });
});
