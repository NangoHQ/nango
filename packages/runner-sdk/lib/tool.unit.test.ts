import { describe, expect, expectTypeOf, it } from 'vitest';
import * as z from 'zod';

import { createTool, toolMetaToTags } from './tool.js';

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
