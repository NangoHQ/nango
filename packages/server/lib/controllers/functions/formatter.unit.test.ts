import { describe, expect, it } from 'vitest';

import type { functionConfigService } from '@nangohq/shared';
import type { FunctionTags, GetToolResponse } from '@nangohq/types';
import type { JSONSchema7 } from 'json-schema';

describe('toGetToolResponse meta', () => {
    it.each<{ name: string; tags: FunctionTags; expected: GetToolResponse['meta'] }>([
        {
            name: 'returns reserved tags at top level',
            tags: { required_scopes: ['read'], instructions: 'do this', a: 'a', b: 'b' },
            expected: { required_scopes: ['read'], instructions: 'do this', tags: { a: 'a', b: 'b' } }
        },
        { name: 'always includes tags when empty', tags: {}, expected: { tags: {} } },
        {
            name: 'separates reserved tags from other tags',
            tags: { instructions: 'Use with care', required_scopes: ['repo', 'issues:write'], category: 'crm', entities: ['contacts'] },
            expected: { instructions: 'Use with care', required_scopes: ['repo', 'issues:write'], tags: { category: 'crm', entities: ['contacts'] } }
        },
        {
            name: 'omits reserved tags when they are not the expected type',
            tags: { instructions: ['Use with care'], required_scopes: 'repo' },
            expected: { tags: {} }
        },
        {
            name: 'preserves empty instructions and scopes',
            tags: { instructions: '', required_scopes: [] },
            expected: { instructions: '', required_scopes: [], tags: {} }
        }
    ])('$name', async ({ tags, expected }) => {
        const { toGetToolResponse } = await import('./formatter.js');
        const fn = {
            config: { uuid: 'function-id', name: 'function' },
            integration: { id: 1, unique_key: 'integration', provider: 'provider' },
            currentVersion: { description: 'function', tags, source: 'repo', json_schema: {}, input_schema_ref: null, output_schema_ref: null }
        } as functionConfigService.CurrentFunctionConfig;

        expect(toGetToolResponse(fn).meta).toStrictEqual(expected);
        expect(fn.currentVersion.tags).toStrictEqual(tags);
    });
});

describe.each(['toGetFunctionResponse', 'toGetToolResponse'] as const)('%s schemas', (helper) => {
    const input: JSONSchema7 = { type: 'object', properties: { model: { $ref: '#/definitions/Model' } } };
    const output: JSONSchema7 = { type: 'array', items: { $ref: '#/definitions/Model' } };
    const model: JSONSchema7 = { type: 'object', properties: { child: { $ref: '#/definitions/Child' } } };
    const child: JSONSchema7 = { type: 'object', properties: { parent: { $ref: '#/definitions/Model' } } };

    function fixture(jsonSchema: JSONSchema7, ref: string | null): functionConfigService.CurrentFunctionConfig {
        return {
            config: { uuid: 'function-id', name: 'function', enabled: true, created_at: new Date(), updated_at: new Date() },
            integration: { id: 1, unique_key: 'integration', provider: 'provider' },
            currentVersion: {
                description: 'function',
                tags: {},
                source: 'repo',
                trigger: { kind: 'none' },
                json_schema: jsonSchema,
                input_schema_ref: ref,
                output_schema_ref: '#/definitions/Output'
            }
        } as functionConfigService.CurrentFunctionConfig;
    }

    it('preserves transitive and circular references for input and output without unrelated models', async () => {
        const helpers = await import('./formatter.js');
        const response = helpers[helper](
            fixture({ definitions: { Input: input, Output: output, Model: model, Child: child, Unrelated: { type: 'string' } } }, '#/definitions/Input')
        );

        expect(response.input_json_schema).toStrictEqual({
            $ref: '#/definitions/Input',
            definitions: { Input: input, Model: model, Child: child }
        });
        expect(response.output_json_schema).toStrictEqual({
            $ref: '#/definitions/Output',
            definitions: { Output: output, Model: model, Child: child }
        });
    });

    it.each([
        null,
        '#/other/Input',
        '#/definitions/Missing',
        '#/definitions/Boolean',
        '#/definitions/__proto__',
        '#/definitions/constructor',
        '#/definitions/toString'
    ])('returns null for an unavailable root %s', async (ref) => {
        const helpers = await import('./formatter.js');
        expect(helpers[helper](fixture({ definitions: { Boolean: true } }, ref)).input_json_schema).toBeNull();
    });

    it('returns null when a referenced model is missing', async () => {
        const helpers = await import('./formatter.js');
        expect(helpers[helper](fixture({ definitions: { Input: input } }, '#/definitions/Input')).input_json_schema).toBeNull();
    });
});
