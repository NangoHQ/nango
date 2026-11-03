import { describe, expect, expectTypeOf, it } from 'vitest';
import * as z from 'zod';

import { createTool, toolMetaToTags } from './tool.js';

import type { FunctionError } from './errors.js';
import type { HttpResponse } from './function.js';

type Has<T, K extends PropertyKey> = K extends keyof T ? true : false;

describe('createTool', () => {
    it('builds an http function with proxy access', () => {
        const tool = createTool({
            name: 'get_issue',
            description: 'Get an issue',
            input: z.object({ issueNumber: z.number() }),
            output: z.object({ title: z.string() }),
            meta: { instructions: 'Use it to read one issue', requiredScopes: ['repo'], tags: { domain: 'issues' } },
            exec: (nango, trigger) => {
                expectTypeOf<Has<typeof nango, 'proxy'>>().toEqualTypeOf<true>();
                expectTypeOf(new nango.Error({ message: 'Failed' })).toEqualTypeOf<FunctionError<{ message: string }>>();
                expectTypeOf(nango.get<{ title: string }>({ endpoint: '/issues/1' })).toEqualTypeOf<Promise<HttpResponse<{ title: string }>>>();
                expectTypeOf<Has<typeof nango, 'getConnection'>>().toEqualTypeOf<true>();
                expectTypeOf<Has<typeof nango, 'batchSave'>>().toEqualTypeOf<false>();
                expectTypeOf<Has<typeof nango, 'getMetadata'>>().toEqualTypeOf<false>();
                expectTypeOf<Has<typeof nango, 'getCheckpoint'>>().toEqualTypeOf<false>();
                expectTypeOf(trigger.kind).toEqualTypeOf<'http'>();
                expectTypeOf(trigger.input).toEqualTypeOf<{ issueNumber: number }>();
                return { title: String(trigger.input.issueNumber) };
            }
        });

        expect(tool).toMatchObject({
            type: 'function',
            name: 'get_issue',
            description: 'Get an issue',
            trigger: { kind: 'http' },
            tags: { domain: 'issues', instructions: 'Use it to read one issue', required_scopes: ['repo'] },
            capabilities: { usesRecords: false, usesCheckpoints: false, usesMetadata: false, usesOutbound: true, usesInvoke: false }
        });
        expect(tool).not.toHaveProperty('meta');
    });

    it('infers metadata and checkpoint types and enables their capabilities', () => {
        const data = {
            metadata: z.object({ organization: z.string() }),
            checkpoint: z.object({ cursor: z.string() })
        };
        const tool = createTool({
            description: 'Resume fetching issues',
            input: z.object({}),
            output: z.object({ cursor: z.string() }),
            data,
            exec: (nango) => {
                expectTypeOf(nango.getMetadata()).toEqualTypeOf<Promise<{ organization: string }>>();
                expectTypeOf<typeof nango.setMetadata>().parameter(0).toEqualTypeOf<{ organization: string }>();
                expectTypeOf<typeof nango.updateMetadata>().parameter(0).toEqualTypeOf<{ organization?: string }>();
                expectTypeOf(nango.getCheckpoint()).toEqualTypeOf<Promise<{ cursor: string } | undefined>>();
                expectTypeOf<typeof nango.saveCheckpoint>().parameter(0).toEqualTypeOf<{ cursor: string }>();
                expectTypeOf(nango.clearCheckpoint()).toEqualTypeOf<Promise<void>>();
                expectTypeOf<Has<typeof nango, 'batchSave'>>().toEqualTypeOf<false>();
                return { cursor: 'next' };
            }
        });

        expect(tool.data).toEqual(data);
        expectTypeOf(tool.data?.metadata).toEqualTypeOf<typeof data.metadata | undefined>();
        expectTypeOf(tool.data?.checkpoint).toEqualTypeOf<typeof data.checkpoint | undefined>();
        expect(tool.capabilities).toEqual({
            usesMetadata: true,
            usesCheckpoints: true,
            usesRecords: false,
            usesOutbound: true,
            usesInvoke: false
        });
    });

    it('enables metadata independently', () => {
        const tool = createTool({
            description: 'Read connection settings',
            input: z.object({}),
            output: z.void(),
            data: { metadata: z.object({ organization: z.string() }) },
            exec: (nango) => {
                expectTypeOf<Has<typeof nango, 'getMetadata'>>().toEqualTypeOf<true>();
                expectTypeOf<Has<typeof nango, 'getCheckpoint'>>().toEqualTypeOf<false>();
            }
        });
        expect(tool.capabilities).toMatchObject({ usesMetadata: true, usesCheckpoints: false });
    });

    it('enables checkpoints independently', () => {
        const tool = createTool({
            description: 'Resume fetching issues',
            input: z.object({}),
            output: z.void(),
            data: { checkpoint: z.object({ cursor: z.string() }) },
            exec: (nango) => {
                expectTypeOf<Has<typeof nango, 'getMetadata'>>().toEqualTypeOf<false>();
                expectTypeOf<Has<typeof nango, 'getCheckpoint'>>().toEqualTypeOf<true>();
            }
        });
        expect(tool.capabilities).toMatchObject({ usesMetadata: false, usesCheckpoints: true });
    });

    it('requires input and output', () => {
        // @ts-expect-error input and output are required
        createTool({ description: 'No schemas', exec: () => {} });
    });

    it('does not accept a trigger', () => {
        createTool({
            description: 'Scheduled tool',
            input: z.object({}),
            output: z.void(),
            // @ts-expect-error tools are always http
            trigger: { kind: 'schedule', frequency: 'every hour' },
            exec: () => {}
        });
    });
});

describe('toolMetaToTags', () => {
    it('returns no tags without meta', () => {
        expect(toolMetaToTags(undefined)).toStrictEqual({});
    });

    it('only sets the fields that are present', () => {
        expect(toolMetaToTags({ requiredScopes: [] })).toStrictEqual({ required_scopes: [] });
    });
});
