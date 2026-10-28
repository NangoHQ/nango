import { describe, expect, it } from 'vitest';

import type { functionConfigService } from '@nangohq/shared';
import type { JSONSchema7 } from 'json-schema';

describe('toGetFunctionResponse schemas', () => {
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
        const response = helpers.toGetFunctionResponse(
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
        expect(helpers.toGetFunctionResponse(fixture({ definitions: { Boolean: true } }, ref)).input_json_schema).toBeNull();
    });

    it('returns null when a referenced model is missing', async () => {
        const helpers = await import('./formatter.js');
        expect(helpers.toGetFunctionResponse(fixture({ definitions: { Input: input } }, '#/definitions/Input')).input_json_schema).toBeNull();
    });
});
