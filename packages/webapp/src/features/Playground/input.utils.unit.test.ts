import { describe, expect, it, vi } from 'vitest';

import { getInputFields, getPlaygroundInput, getPlaygroundInputSchema } from './input.utils';
import { parsePlaygroundInput, validateAndParseInputs } from './playground.utils';

import type { ListedNangoActionFunction, ListedNangoToolFunction } from '@nangohq/types';
import type { JSONSchema7 } from 'json-schema';

vi.mock('@/utils/api', () => ({ apiFetch: vi.fn() }));

function tool(input_json_schema: JSONSchema7 | null): ListedNangoToolFunction {
    return {
        type: 'tool',
        name: 'test-tool',
        uuid: 'tool-uuid',
        integration_id: 'github',
        provider: 'github',
        description: '',
        id: null,
        enabled: true,
        last_deployed: null,
        source: 'repo',
        input_json_schema,
        output_json_schema: null,
        meta: { tags: {} }
    };
}

describe('native tool input schemas', () => {
    it.each([
        [{ type: ['null', 'integer'], minimum: 1 }, '5', 5],
        [{ type: ['integer', 'null'], minimum: 1 }, 'null', null],
        [{ type: ['null', 'number'] }, '1.5', 1.5],
        [{ type: ['string', 'null'], minLength: 2 }, 'null', null],
        [{ type: ['null', 'string'], minLength: 2 }, 'hello', 'hello'],
        [{ type: ['boolean', 'null'] }, 'false', false],
        [{ type: ['array', 'null'] }, '[1,2]', [1, 2]],
        [{ type: ['object', 'null'] }, '{"name":"Ada"}', { name: 'Ada' }],
        [{ type: ['integer', 'boolean', 'null'] }, 'true', true]
    ] satisfies [JSONSchema7, string, unknown][])('preserves type array alternatives for schema %j', (schema, value, expected) => {
        const scalar = getPlaygroundInput(tool(schema));
        expect(parsePlaygroundInput(scalar, { input: value })).toEqual({ ok: true, parsed: expected });
        expect(parsePlaygroundInput(scalar, { input: 'null' })).toEqual({ ok: true, parsed: null });
        const object = getPlaygroundInput(tool({ type: 'object', properties: { value: schema }, required: ['value'] }));
        expect(parsePlaygroundInput(object, { value })).toEqual({ ok: true, parsed: { value: expected } });
        expect(parsePlaygroundInput(object, { value: 'null' })).toEqual({ ok: true, parsed: { value: null } });
    });

    it.each([
        [{ type: ['null', 'integer'], minimum: 1 }, '0'],
        [{ type: ['integer', 'null'] }, '1.5'],
        [{ type: ['string', 'null'], minLength: 2 }, 'a'],
        [{ type: ['null', 'string'], pattern: '^a' }, 'b'],
        [{ type: ['null', 'number'], enum: [null, 1] }, '2'],
        [{ type: ['integer', 'boolean', 'null'] }, 'invalid']
    ] satisfies [JSONSchema7, string][])('enforces type array branch constraints for schema %j', (schema, value) => {
        const input = getPlaygroundInput(tool(schema));
        expect(parsePlaygroundInput(input, { input: value }).ok).toBe(false);
        expect(parsePlaygroundInput(input, {}).ok).toBe(false);
    });

    it('accepts an empty string through a top-level nullable type array', () => {
        const input = getPlaygroundInput(tool({ type: ['null', 'string'] }));
        expect(parsePlaygroundInput(input, { input: '' })).toEqual({ ok: true, parsed: '' });
    });

    it.each(['anyOf', 'oneOf'] as const)('accepts empty strings through top-level %s string branches', (keyword) => {
        const input = getPlaygroundInput(tool({ [keyword]: [{ type: 'integer' }, { type: 'string' }] }));
        expect(parsePlaygroundInput(input, { input: '' })).toEqual({ ok: true, parsed: '' });
        expect(parsePlaygroundInput(input, { input: '  ' })).toEqual({ ok: true, parsed: '  ' });
        expect(parsePlaygroundInput(input, { input: '5' })).toEqual({ ok: true, parsed: 5 });
    });

    it.each([
        { type: 'string', minLength: 1 },
        { type: 'string', pattern: '^a' },
        { type: 'string', enum: ['active'] }
    ] satisfies JSONSchema7[])('enforces string branch constraints for empty union inputs: %j', (branch) => {
        const input = getPlaygroundInput(tool({ anyOf: [{ type: 'integer' }, branch] }));
        expect(parsePlaygroundInput(input, { input: '' }).ok).toBe(false);
        expect(parsePlaygroundInput(input, { input: 'active' })).toEqual({ ok: true, parsed: 'active' });
    });

    it('checks every nested string branch before rejecting empty input', () => {
        const input = getPlaygroundInput(tool({ anyOf: [{ type: 'string', minLength: 1 }, { oneOf: [{ type: 'integer' }, { type: 'string' }] }] }));
        expect(parsePlaygroundInput(input, { input: '' })).toEqual({ ok: true, parsed: '' });
    });

    it('rejects empty input for unions without a string branch and required object fields', () => {
        const scalar = getPlaygroundInput(tool({ anyOf: [{ type: 'integer' }, { type: 'null' }] }));
        expect(parsePlaygroundInput(scalar, { input: '' }).ok).toBe(false);
        const object = getPlaygroundInput(
            tool({ type: 'object', properties: { value: { anyOf: [{ type: 'integer' }, { type: 'string' }] } }, required: ['value'] })
        );
        expect(parsePlaygroundInput(object, { value: '' })).toEqual({ ok: false, errors: { value: 'Required' } });
    });

    it.each([
        [{ enum: [1, 2] }, '1', 1],
        [{ enum: [true, false] }, 'false', false],
        [{ enum: [null] }, 'null', null],
        [{ enum: ['active', 'inactive'] }, 'active', 'active'],
        [{ enum: [2, '1'] }, '1', '1'],
        [{ enum: [1, 'active', false, null] }, '1', 1],
        [{ enum: [1, 'active', false, null] }, 'active', 'active'],
        [{ enum: [1, 'active', false, null] }, 'false', false],
        [{ enum: [1, 'active', false, null] }, 'null', null]
    ] satisfies [JSONSchema7, string, unknown][])('infers enum value types without an explicit type for schema %j', (schema, value, expected) => {
        const input = getPlaygroundInput(tool(schema));
        expect(parsePlaygroundInput(input, { input: value })).toEqual({ ok: true, parsed: expected });
        expect(parsePlaygroundInput(input, { input: 'invalid' }).ok).toBe(false);
    });

    it('preserves an explicit type when enum values have different types', () => {
        const input = getPlaygroundInput(tool({ type: 'string', enum: [1, 'active'] }));
        expect(parsePlaygroundInput(input, { input: '1' }).ok).toBe(false);
        expect(parsePlaygroundInput(input, { input: 'active' })).toEqual({ ok: true, parsed: 'active' });
    });

    it.each([
        [{ type: 'array', items: { type: 'number' } }, '[1,2]', [1, 2]],
        [{ type: 'string' }, 'hello', 'hello'],
        [{ type: 'string' }, '', ''],
        [{ type: 'number' }, '5', 5],
        [{ type: 'boolean' }, 'false', false],
        [{ type: 'null' }, 'null', null],
        [{ anyOf: [{ type: 'number' }, { type: 'null' }] }, '5', 5],
        [{ oneOf: [{ type: 'array' }, { type: 'object' }] }, '[1,2]', [1, 2]],
        [{ oneOf: [{ type: 'array' }, { type: 'object' }] }, '{"name":"Ada"}', { name: 'Ada' }]
    ] satisfies [JSONSchema7, string, unknown][])('preserves top-level input values for schema %j', (schema, value, expected) => {
        const input = getPlaygroundInput(tool(schema));
        expect(input.kind).toBe('value');
        const result = parsePlaygroundInput(input, { input: value });
        expect(result).toEqual({ ok: true, parsed: expected });
        expect(result.ok && JSON.stringify({ input: result.parsed })).toBe(JSON.stringify({ input: expected }));
    });

    it('resolves a referenced array input and rejects malformed JSON', () => {
        const input = getPlaygroundInput(tool({ $ref: '#/definitions/Input', definitions: { Input: { type: 'array', items: { type: 'string' } } } }));
        expect(input.kind).toBe('value');
        expect(parsePlaygroundInput(input, { input: '["a"]' })).toEqual({ ok: true, parsed: ['a'] });
        expect(parsePlaygroundInput(input, { input: '[' }).ok).toBe(false);
        expect(parsePlaygroundInput(input, { input: '{}' }).ok).toBe(false);
        expect(parsePlaygroundInput(input, {}).ok).toBe(false);
    });

    it('resolves action field references against the root schema and sends nested JSON values', () => {
        const action: ListedNangoActionFunction = {
            name: 'test-action',
            type: 'action',
            id: 1,
            enabled: true,
            source: 'repo',
            last_deployed: null,
            input: 'Input',
            returns: [],
            json_schema: {
                definitions: {
                    Input: {
                        type: 'object',
                        properties: { user: { $ref: '#/definitions/User' }, ids: { $ref: '#/definitions/Ids' } },
                        required: ['user']
                    },
                    User: { type: 'object', properties: { name: { type: 'string' } } },
                    Ids: { type: 'array', items: { type: 'integer' } }
                }
            }
        };
        const input = getPlaygroundInput(action);
        expect(input).toEqual({
            kind: 'object',
            fields: [
                { name: 'user', type: 'object', description: undefined, required: true },
                { name: 'ids', type: 'array', description: undefined, required: false }
            ]
        });
        expect(parsePlaygroundInput(input, { user: '{"name":"Ada"}', ids: '[1,2]' })).toEqual({
            ok: true,
            parsed: { user: { name: 'Ada' }, ids: [1, 2] }
        });
    });

    it('distinguishes no declared input from an empty object schema', () => {
        expect(getPlaygroundInput(tool(null))).toEqual({ kind: 'none' });
        expect(getPlaygroundInput(tool({ type: 'object', properties: {} }))).toEqual({ kind: 'object', fields: [] });
    });

    it('preserves the empty input object for actions without an input model', () => {
        const action: ListedNangoActionFunction = {
            name: 'test-action',
            type: 'action',
            id: 1,
            enabled: true,
            source: 'repo',
            last_deployed: null,
            returns: ['Output'],
            json_schema: { definitions: { Output: { type: 'object' } } }
        };
        const input = getPlaygroundInput(action);
        expect(input).toEqual({ kind: 'object', fields: [] });
        expect(parsePlaygroundInput(input, {})).toEqual({ ok: true, parsed: {} });
        expect(parsePlaygroundInput(getPlaygroundInput({ ...action, json_schema: null }), {})).toEqual({ ok: true, parsed: {} });
        expect(parsePlaygroundInput(getPlaygroundInput(tool(null)), {})).toEqual({ ok: true, parsed: undefined });
        expect(getPlaygroundInput({ ...action, input: 'Input', json_schema: { definitions: { Input: { type: 'object', properties: {} } } } })).toEqual({
            kind: 'object',
            fields: []
        });
        expect(
            getPlaygroundInput({
                ...action,
                input: 'Input',
                json_schema: { definitions: { Input: { type: 'object', additionalProperties: { type: 'string' } } } }
            })
        ).toEqual({ kind: 'object', fields: [] });
    });

    it('resolves the root reference and preserves definitions for nested references', () => {
        const schema: JSONSchema7 = {
            $ref: '#/definitions/Input',
            definitions: {
                Input: { type: 'object', properties: { item: { $ref: '#/definitions/Item' } }, additionalProperties: false },
                Item: { type: 'string' }
            }
        };
        const resolved = getPlaygroundInputSchema(tool(schema));
        expect(resolved?.properties).toEqual({ item: { $ref: '#/definitions/Item' } });
        expect(resolved?.definitions).toEqual(schema.definitions);
        expect(getInputFields(resolved)).toEqual([{ name: 'item', type: 'string', description: undefined, required: false }]);
    });

    it('uses form fields for a closed object with supported property types', () => {
        const schema: JSONSchema7 = {
            type: 'object',
            properties: { count: { type: 'integer', minimum: 1 } },
            required: ['count'],
            additionalProperties: false
        };
        const resolved = getPlaygroundInputSchema(tool({ $ref: '#/definitions/Input', definitions: { Input: schema } }));
        expect(getInputFields(resolved)).toEqual([{ name: 'count', type: 'integer', description: undefined, required: true, minimum: 1 }]);
    });

    it('uses the same field types and nested JSON parsing as actions', () => {
        const schema: JSONSchema7 = {
            type: 'object',
            properties: {
                options: { type: 'object', properties: { nested: { type: 'boolean' } } },
                ids: { type: 'array', items: { type: 'integer' } },
                label: { type: ['string', 'null'] }
            },
            required: ['options', 'ids']
        };
        const native = tool({ $ref: '#/definitions/Input', definitions: { Input: schema } });
        const action: ListedNangoActionFunction = {
            name: native.name,
            type: 'action',
            id: 1,
            enabled: true,
            source: 'repo',
            last_deployed: null,
            input: 'Input',
            returns: [],
            json_schema: { definitions: { Input: schema } }
        };
        const fields = getInputFields(getPlaygroundInputSchema(native));
        expect(fields).toEqual(getInputFields(getPlaygroundInputSchema(action)));
        expect(validateAndParseInputs(fields, { options: '{"nested":true}', ids: '[1,2]', label: 'test' })).toEqual({
            ok: true,
            parsed: { options: { nested: true }, ids: [1, 2], label: 'test' }
        });
    });

    it('resolves referenced object and array fields to use the existing JSON field inputs', () => {
        const schema: JSONSchema7 = {
            type: 'object',
            properties: { options: { $ref: '#/definitions/Options' }, ids: { $ref: '#/definitions/Ids' } },
            definitions: { Options: { type: 'object' }, Ids: { type: 'array', items: { type: 'string' } } }
        };
        expect(getInputFields(getPlaygroundInputSchema(tool(schema))).map(({ name, type }) => ({ name, type }))).toEqual([
            { name: 'options', type: 'object' },
            { name: 'ids', type: 'array' }
        ]);
    });

    it('handles circular and missing references without looping', () => {
        for (const schema of [{ $ref: '#/definitions/Missing' }, { $ref: '#/definitions/Input', definitions: { Input: { $ref: '#/definitions/Input' } } }]) {
            const resolved = getPlaygroundInputSchema(tool(schema));
            expect(resolved).toEqual(schema);
        }
    });
});

describe('getInputFields', () => {
    it('keeps property descriptions when resolving references and falls back to the definition description', () => {
        const root: JSONSchema7 = {
            definitions: { User: { type: 'object', description: 'A user' } }
        };
        const fields = getInputFields(
            {
                properties: {
                    owner: { $ref: '#/definitions/User', description: 'The owner of this project' },
                    reviewer: { $ref: '#/definitions/User' },
                    unnamed: { $ref: '#/definitions/User', description: '' }
                }
            },
            root
        );
        expect(fields.map(({ name, type, description }) => ({ name, type, description }))).toEqual([
            { name: 'owner', type: 'object', description: 'The owner of this project' },
            { name: 'reviewer', type: 'object', description: 'A user' },
            { name: 'unnamed', type: 'object', description: '' }
        ]);
    });

    it.each(['anyOf', 'oneOf'] as const)('parses nullable numeric %s fields as numbers or null', (keyword) => {
        const input = getPlaygroundInput(
            tool({
                type: 'object',
                properties: { value: { [keyword]: [{ type: 'number', minimum: 1 }, { type: 'null' }] } },
                required: ['value']
            })
        );
        expect(parsePlaygroundInput(input, { value: '5' })).toEqual({ ok: true, parsed: { value: 5 } });
        expect(parsePlaygroundInput(input, { value: 'null' })).toEqual({ ok: true, parsed: { value: null } });
        expect(parsePlaygroundInput(input, { value: '0' }).ok).toBe(false);
        expect(parsePlaygroundInput(input, { value: 'invalid' }).ok).toBe(false);
        expect(parsePlaygroundInput(input, {}).ok).toBe(false);
    });

    it.each(['anyOf', 'oneOf'] as const)('parses every supported branch of a %s union', (keyword) => {
        const input = getPlaygroundInput(
            tool({
                type: 'object',
                properties: {
                    value: { [keyword]: [{ type: 'boolean' }, { $ref: '#/definitions/User' }, { type: 'array', items: { type: 'number' } }] }
                },
                definitions: { User: { type: 'object', properties: { name: { type: 'string' } } } }
            })
        );
        expect(parsePlaygroundInput(input, { value: 'false' })).toEqual({ ok: true, parsed: { value: false } });
        expect(parsePlaygroundInput(input, { value: '{"name":"Ada"}' })).toEqual({ ok: true, parsed: { value: { name: 'Ada' } } });
        expect(parsePlaygroundInput(input, { value: '[1,2]' })).toEqual({ ok: true, parsed: { value: [1, 2] } });
        expect(parsePlaygroundInput(input, {})).toEqual({ ok: true, parsed: {} });
    });

    it('returns [] for null, undefined, and non-object inputs', () => {
        expect(getInputFields(null)).toEqual([]);
        expect(getInputFields(undefined)).toEqual([]);
        expect(getInputFields('string' as any)).toEqual([]);
    });

    it('returns [] when schema has no properties', () => {
        expect(getInputFields({})).toEqual([]);
        expect(getInputFields({ type: 'object' })).toEqual([]);
    });

    it('maps properties to InputFields with correct types', () => {
        const schema: JSONSchema7 = {
            properties: {
                name: { type: 'string' },
                count: { type: 'number' }
            }
        };
        expect(getInputFields(schema)).toEqual([
            { name: 'name', type: 'string', description: undefined, required: false },
            { name: 'count', type: 'number', description: undefined, required: false }
        ]);
    });

    it('marks fields listed in required as required=true', () => {
        const schema: JSONSchema7 = {
            properties: {
                id: { type: 'string' },
                label: { type: 'string' }
            },
            required: ['id']
        };
        const fields = getInputFields(schema);
        expect(fields.find((f) => f.name === 'id')?.required).toBe(true);
        expect(fields.find((f) => f.name === 'label')?.required).toBe(false);
    });

    it('preserves null and integer alternatives from a type array', () => {
        const schema: JSONSchema7 = {
            properties: {
                value: { type: ['null', 'integer'] }
            }
        };
        expect(getInputFields(schema)[0]?.type).toBe('null | integer');
    });

    it('preserves every alternative when a type array contains no null', () => {
        const schema: JSONSchema7 = {
            properties: {
                value: { type: ['integer', 'string'] }
            }
        };
        expect(getInputFields(schema)[0]?.type).toBe('integer | string');
    });

    it('skips properties defined as false', () => {
        const schema: JSONSchema7 = {
            properties: {
                allowed: { type: 'string' },
                forbidden: false
            }
        };
        const fields = getInputFields(schema);
        expect(fields).toHaveLength(1);
        expect(fields[0]?.name).toBe('allowed');
    });

    it('includes properties defined as true with type "string" fallback', () => {
        const schema: JSONSchema7 = {
            properties: {
                anything: true
            }
        };
        const fields = getInputFields(schema);
        expect(fields).toHaveLength(1);
        expect(fields[0]).toEqual({ name: 'anything', type: 'string', description: undefined, required: false });
    });

    it('falls back to "string" when type is missing', () => {
        const schema: JSONSchema7 = {
            properties: {
                anything: {}
            }
        };
        expect(getInputFields(schema)[0]?.type).toBe('string');
    });

    it('falls back to "string" when type array is empty', () => {
        const schema: JSONSchema7 = {
            properties: {
                weird: { type: [] }
            }
        };
        expect(getInputFields(schema)[0]?.type).toBe('string');
    });

    it('includes description when present', () => {
        const schema: JSONSchema7 = {
            properties: {
                token: { type: 'string', description: 'API token' }
            }
        };
        expect(getInputFields(schema)[0]?.description).toBe('API token');
    });

    it('treats a non-array required field gracefully (no required marks)', () => {
        const schema = {
            properties: { x: { type: 'string' } },
            required: 'x' // malformed
        } as any;
        expect(getInputFields(schema)[0]?.required).toBe(false);
    });

    describe('scalar constraints', () => {
        it('extracts string constraints', () => {
            const schema: JSONSchema7 = {
                properties: {
                    token: { type: 'string', minLength: 3, maxLength: 50, pattern: '^[a-z]+$' }
                }
            };
            const field = getInputFields(schema)[0];
            expect(field?.minLength).toBe(3);
            expect(field?.maxLength).toBe(50);
            expect(field?.pattern).toBe('^[a-z]+$');
        });

        it('extracts number constraints', () => {
            const schema: JSONSchema7 = {
                properties: {
                    count: { type: 'number', minimum: 0, maximum: 100 }
                }
            };
            const field = getInputFields(schema)[0];
            expect(field?.minimum).toBe(0);
            expect(field?.maximum).toBe(100);
        });

        it('extracts exclusiveMinimum and exclusiveMaximum', () => {
            const schema: JSONSchema7 = {
                properties: {
                    ratio: { type: 'number', exclusiveMinimum: 0, exclusiveMaximum: 1 }
                }
            };
            const field = getInputFields(schema)[0];
            expect(field?.exclusiveMinimum).toBe(0);
            expect(field?.exclusiveMaximum).toBe(1);
        });

        it('extracts enum', () => {
            const schema: JSONSchema7 = {
                properties: {
                    status: { type: 'string', enum: ['active', 'inactive'] }
                }
            };
            const field = getInputFields(schema)[0];
            expect(field?.enum).toEqual(['active', 'inactive']);
        });

        it('does not set constraint keys when absent', () => {
            const schema: JSONSchema7 = {
                properties: { name: { type: 'string' } }
            };
            const field = getInputFields(schema)[0];
            expect('minLength' in field).toBe(false);
            expect('maxLength' in field).toBe(false);
            expect('pattern' in field).toBe(false);
            expect('minimum' in field).toBe(false);
            expect('maximum' in field).toBe(false);
            expect('enum' in field).toBe(false);
        });
    });
});
