import { beforeEach, describe, expect, it } from 'vitest';

import { clearFunctionInputValidatorCache, validateFunctionInput } from './validate.js';

import type { DBFunctionConfigVersion } from '@nangohq/types';

/**
 * Bound on how long input validation may occupy the caller.
 * A nested quantifier that returns an error only after this has already stalled the API event loop.
 */
const BUDGET_MS = 200;

const now = new Date('2026-01-01T00:00:00.000Z');

function versionWithStringPattern(id: number, pattern: string): DBFunctionConfigVersion {
    return {
        id,
        function_config_id: 1,
        description: 'Test function',
        tags: {},
        file_location: 'functions/github/test',
        version: '1',
        source: 'repo',
        trigger: { kind: 'http', subscriptions: ['push'] },
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
                    properties: { body: { $ref: '#/definitions/Nested' } },
                    required: ['body'],
                    additionalProperties: false
                },
                Nested: { type: 'string', pattern }
            }
        },
        created_at: now,
        updated_at: now,
        deleted_at: null
    };
}

function versionWithPatternProperty(id: number, pattern: string): DBFunctionConfigVersion {
    return {
        ...versionWithStringPattern(id, pattern),
        json_schema: {
            definitions: {
                Input: {
                    type: 'object',
                    patternProperties: { [pattern]: { type: 'boolean' } },
                    additionalProperties: false
                }
            }
        }
    };
}

function expectBoundedRejection(version: DBFunctionConfigVersion, input: unknown, label: string): void {
    const started = performance.now();
    const result = validateFunctionInput(version, input);
    const elapsed = performance.now() - started;

    expect(result.isErr(), label).toBe(true);
    expect(elapsed, label).toBeLessThan(BUDGET_MS);
}

describe('validateFunctionInput pattern bounds', () => {
    beforeEach(() => {
        clearFunctionInputValidatorCache();
    });

    it('rejects a nested pattern referenced by the input schema before it occupies the caller', () => {
        const version = versionWithStringPattern(41, '^(a+)+$');
        const input = { body: `${'a'.repeat(28)}!` };

        expectBoundedRejection(version, input, 'first compile');
        expectBoundedRejection(version, input, 'cached validator');
    }, 20_000);

    it('rejects a different nested pattern before it occupies the caller', () => {
        const version = versionWithStringPattern(42, '^(a+)+b$');
        const input = { body: `${'a'.repeat(27)}!` };

        expectBoundedRejection(version, input, 'first compile');
        expectBoundedRejection(version, input, 'cached validator');
    }, 20_000);

    it('rejects a patternProperties pattern before it occupies the caller', () => {
        const version = versionWithPatternProperty(43, '^(a+)+$');
        const input = { [`${'a'.repeat(28)}!`]: true };

        expectBoundedRejection(version, input, 'first compile');
        expectBoundedRejection(version, input, 'cached validator');
    }, 20_000);
});
