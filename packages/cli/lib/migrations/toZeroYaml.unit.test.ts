import jscodeshift from 'jscodeshift';
import { describe, expect, it } from 'vitest';

import * as zeroYaml from './toZeroYaml.js';

import type { NangoModel } from '@nangohq/types';

const models = new Map<string, NangoModel>([
    [
        'Model',
        {
            name: 'Model',
            fields: [
                { name: 'id', value: 'string', tsType: true },
                { name: 'undefined', value: 'undefined', tsType: true },
                { name: 'arrTsType', value: 'string', tsType: true, array: true },
                { name: 'null', value: 'null', tsType: true },
                { name: 'bool', optional: false, tsType: true, value: 'boolean' },
                { name: 'any', tsType: true, value: 'any' },
                { name: 'opt', value: 'number', tsType: true, optional: true },
                { name: 'ref', value: 'Foo', tsType: false, model: true, optional: true },
                {
                    name: 'union',
                    union: true,
                    value: [
                        { name: '0', value: 'literal1' },
                        { name: '1', value: 'literal2' }
                    ],
                    tsType: false
                },
                {
                    name: 'array',
                    array: true,
                    value: [
                        { name: '0', value: 'arr1' },
                        { name: '1', value: 'arr2' }
                    ],
                    tsType: false
                },
                { name: 'obj', value: [{ name: 'nes', value: 'ted' }] },
                {
                    name: 'dynamicObj',
                    optional: false,
                    value: [{ dynamic: true, name: '__string', optional: false, tsType: true, value: 'date' }]
                },
                {
                    name: 'union2',
                    union: true,
                    value: [
                        { name: '0', value: 'Model', model: true },
                        { name: '1', value: 'Model', array: true, model: true }
                    ],
                    tsType: false
                },
                {
                    name: 'dateOrNull',
                    union: true,
                    value: [
                        { name: '0', value: 'Date', tsType: true },
                        { name: '1', value: 'undefined', tsType: true }
                    ],
                    tsType: false,
                    optional: true
                }
            ]
        }
    ],
    [
        'ModelDynamic',
        {
            name: 'ModelDynamic',
            fields: [
                { dynamic: true, name: '__string', optional: false, tsType: true, value: 'string' },
                { name: 'id', optional: false, tsType: true, value: 'string' }
            ]
        }
    ],
    [
        'Metadata',
        {
            name: 'Metadata',
            fields: [
                { name: 'foo', value: 'bar' },
                { name: 'model', model: true, value: 'Model' }
            ]
        }
    ],
    [
        'IssueInput',
        {
            name: 'IssueInput',
            fields: [
                { name: 'title', value: 'string' },
                { name: 'body', value: 'string' }
            ]
        }
    ],
    [
        'IssueOutput',
        {
            name: 'IssueOutput',
            fields: [
                { name: 'id', value: 'string' },
                { name: 'status', value: 'string' }
            ]
        }
    ],
    [
        'ActionErrorResponse',
        {
            name: 'ActionErrorResponse',
            fields: [{ name: 'msg', value: 'string' }]
        }
    ]
]);
describe('generateModelsTs', () => {
    it('should generate models.ts', () => {
        const content = zeroYaml.generateModelsTs({
            parsed: { models }
        });
        expect(content).toMatchSnapshot();
    });
});

describe('transformSync', () => {
    it('should transform a sync', () => {
        const ts = `import type { Model, NangoSync } from "../../models";
export default async function fetchData(nango: NangoSync) {
    await nango.log('hello');
    await nango.batchSave<Model>([{
        'id': 'foobar',
    }], 'Model');

}
export async function onWebhookPayloadReceived(
  nango: NangoSync,
  payload: any,
): Promise<void> {
  await nango.log('Received webhook', payload);
  await nango.batchSave<Model>([{}], 'Model');
  const proxyConfig: ProxyConfiguration = {
    endpoint: '/issues',
    retries: 15,
  };
}

function foobar(nango: NangoSync) {
   nango.batchSave<Model>([{}], 'Model');

   throw new nango.ActionError<ActionErrorResponse>({
     msg: 'Failed',
   });
}`;
        const result = zeroYaml.transformSync({
            content: ts,
            sync: {
                type: 'sync',
                name: 'test',
                description: 'Test sync',
                version: '1.2.3',
                runs: 'every hour',
                auto_start: true,
                sync_type: 'full',
                track_deletes: false,
                scopes: ['repo', 'user'],
                endpoints: [{ method: 'GET', path: 'top', group: 'foobar' }],
                usedModels: ['Metadata', 'Model', 'ModelDynamic'],
                webhookSubscriptions: ['*'],
                input: 'Metadata',
                output: ['Model', 'ModelDynamic']
            },
            models
        });
        expect(result).toMatchSnapshot();
    });

    it('should transform a sync (different values)', () => {
        const ts = `import type { Model, NangoSync } from "../../models";

interface Config extends ProxyConfiguration {
  params: Record<string, string | number>;
}
export default async function fetchData(nango: NangoSync) {
    await nango.log('hello');
    await nango.batchSave<Model>([{
        'id': 'foobar',
    }], 'Model');
}`;
        const result = zeroYaml.transformSync({
            content: ts,
            sync: {
                type: 'sync',
                name: 'test',
                description: 'Test sync',
                version: '1.2.3',
                runs: 'every 32 days',
                auto_start: false,
                sync_type: 'incremental',
                track_deletes: true,
                scopes: [],
                endpoints: [{ method: 'GET', path: 'top', group: 'foobar' }],
                usedModels: ['Model'],
                webhookSubscriptions: [],
                input: null,
                output: ['Model']
            },
            models
        });
        expect(result).toMatchSnapshot();
    });
});

describe('transformAction', () => {
    it('should transform an action', () => {
        const ts = `import type { NangoAction, IssueOutput, IssueInput } from "../../models";

export default async function runAction(nango: NangoAction, input: IssueInput): Promise<IssueOutput> {
  await nango.log("✅ hello from action");
  const output: IssueOutput = {
    id: '123',
    status: 'open'
  };
  return output;
}

function foobar(nango: NangoAction) {
   nango.batchSave<Model>([{}], 'Model');
}`;
        const result = zeroYaml.transformAction({
            content: ts,
            action: {
                name: 'testAction',
                type: 'action',
                description: 'Test action',
                version: '1.0.0',
                endpoint: { method: 'POST', path: '/example/github/issues', group: 'Issues' },
                input: 'IssueInput',
                output: ['IssueOutput'],
                scopes: ['repo'],
                usedModels: ['IssueInput', 'IssueOutput']
            },
            models
        });
        expect(result).toMatchSnapshot();
    });
});

describe('transformOnEvents', () => {
    it('should transform an on-event script', () => {
        const ts = `import type { NangoSync } from "../../models";

export default async function onEvent(nango: NangoSync): Promise<void> {
  await nango.log("test pre script");
}`;
        const result = zeroYaml.transformOnEvents({
            content: ts,
            eventType: 'pre-connection-deletion',
            models
        });
        expect(result).toMatchSnapshot();
    });
});

describe('processHelperFiles', () => {
    it('should process helper files', () => {
        const result = zeroYaml.processHelperFile({
            content: `import type { NangoAction, NangoSync, Model, ProxyConfiguration } from "../models";

function foobar(nango: NangoSync) {
    nango.batchSave<Model>([{}], 'Model');
}
`
        });
        expect(result.root.toSource()).toMatchSnapshot();
    });
});

describe('nangoModelToZod', () => {
    it('should convert an anon model to zod', () => {
        const j = jscodeshift.withParser('ts');
        const root = j('');
        const result = zeroYaml.nangoModelToZod({
            j: jscodeshift,
            model: { isAnon: true, fields: [{ name: 'foo', value: 'string' }], name: 'Test' },
            referencedModels: []
        });
        root.get().node.program.body.push(j.exportNamedDeclaration(j.variableDeclaration('const', [j.variableDeclarator(j.identifier('Test'), result)]), []));
        expect(root.toSource()).toStrictEqual('export const Test = z.string();');
    });
});
