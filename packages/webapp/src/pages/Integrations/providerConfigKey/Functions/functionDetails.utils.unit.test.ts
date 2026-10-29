import { describe, expect, it, vi } from 'vitest';

import { toFunctionDetails } from './functionDetails.utils';

import type { ListedNangoActionFunction, ListedNangoToolFunction, NangoFunctionTemplate } from '@nangohq/types';
import type { JSONSchema7 } from 'json-schema';

vi.mock('@/features/Playground/input.utils', () => import('../../../../features/Playground/input.utils'));
vi.mock('@/utils/scripts', () => import('../../../../utils/scripts'));

const context = { env: 'dev', integration: 'github' };
const action: ListedNangoActionFunction = {
    name: 'create-issue',
    type: 'action',
    description: 'Create an issue',
    scopes: ['issues:write'],
    id: 1,
    enabled: true,
    source: 'standalone',
    last_deployed: null,
    input: 'Input',
    returns: ['Output'],
    json_schema: {
        definitions: {
            Input: { type: 'object', properties: { title: { type: 'string' } } },
            Output: { type: 'object', properties: { id: { type: 'integer' } } }
        }
    }
};
const tool: ListedNangoToolFunction = {
    name: action.name,
    type: 'tool',
    description: action.description ?? '',
    uuid: 'tool-uuid',
    integration_id: 'github',
    provider: 'github',
    id: null,
    enabled: true,
    source: 'repo',
    last_deployed: null,
    input_json_schema: { $ref: '#/definitions/Input', definitions: action.json_schema?.definitions },
    output_json_schema: { $ref: '#/definitions/Output', definitions: action.json_schema?.definitions },
    meta: { tags: {}, required_scopes: ['issues:write'] }
};

describe('toFunctionDetails', () => {
    it.each<JSONSchema7>([{ type: 'null' }, { type: 'object' }])('omits null and empty-object input and output schemas: %j', (schema) => {
        const native = toFunctionDetails({ ...tool, input_json_schema: schema, output_json_schema: schema }, context);
        const legacy = toFunctionDetails({ ...action, json_schema: { definitions: { Input: schema, Output: schema } } }, context);

        for (const details of [native, legacy]) {
            expect(details.inputSchema).toBeNull();
            expect(details.outputSchemas).toEqual([]);
        }
    });

    it('normalizes action and tool schemas into the same display fields', () => {
        const legacy = toFunctionDetails(action, context);
        const native = toFunctionDetails(tool, context);
        expect(native.name).toBe(legacy.name);
        expect(native.description).toBe(legacy.description);
        expect(native.scopes).toEqual(legacy.scopes);
        for (const details of [legacy, native]) {
            expect(details.inputSchema).toMatchObject({
                type: 'object',
                properties: { title: { type: 'string' } }
            });
            expect(details.outputSchemas).toHaveLength(1);
            expect(details.outputSchemas[0]?.schema).toMatchObject({
                type: 'object',
                properties: { id: { type: 'integer' } }
            });
        }
        expect(native.typeLabel).toBe('tool');
        expect(legacy.typeLabel).toBe('action');
    });

    it('keeps native execution and source loading separate from unsupported legacy management operations', () => {
        expect(toFunctionDetails(tool, context)).toMatchObject({
            runType: 'tool',
            code: { kind: 'deployed', type: 'tool' },
            pullCommand: null,
            delete: undefined
        });
        expect(toFunctionDetails(action, context)).toMatchObject({
            runType: 'action',
            code: { kind: 'deployed', type: 'action' },
            delete: { type: 'action' },
            pullCommand: 'nango pull github create-issue --env dev -a'
        });
        expect(toFunctionDetails(action, context).delete?.description).toContain('delete the action "create-issue"');
        expect(toFunctionDetails({ ...tool, enabled: false }, context).runType).toBeNull();
        expect(toFunctionDetails({ ...action, enabled: false }, context).runType).toBeNull();
    });

    it('keeps templates on catalog source loading with no execution or deletion', () => {
        const template: NangoFunctionTemplate = { name: 'template', type: 'action', input: 'Input', returns: [], json_schema: action.json_schema };
        expect(toFunctionDetails(template, context)).toMatchObject({
            source: 'template',
            code: { kind: 'template', type: 'action' },
            runType: null,
            delete: undefined,
            pullCommand: 'nango pull github template --catalog -a'
        });
    });
});
