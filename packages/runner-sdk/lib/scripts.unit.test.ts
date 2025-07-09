/* eslint-disable @typescript-eslint/unbound-method */
import { describe, expect, expectTypeOf, it } from 'vitest';
import { z } from 'zod';

import { createAction, createOnEvent, createSync } from './scripts.js';

describe('scripts', () => {
    describe('createSync', () => {
        it('should create a sync', () => {
            const sync = createSync({
                description: 'Fetch issues from GitHub',
                endpoints: [{ method: 'GET', path: '/github/issues' }],
                frequency: 'every hour',
                models: {
                    issue: z.object({
                        id: z.string(),
                        title: z.string(),
                        body: z.string()
                    })
                },
                syncType: 'full',
                trackDeletes: false,
                autoStart: true,
                scopes: ['read:user', 'write:user'],
                metadata: z.object({ test: z.string() }),
                webhookSubscriptions: [],
                version: '0.0.1',
                exec: async (nango) => {
                    await nango.log('Hello, world!');

                    expectTypeOf(nango.batchSave).parameter(0).not.toEqualTypeOf<never[]>();
                    expectTypeOf(nango.batchSave).parameter(1).toEqualTypeOf<'issue'>();

                    expectTypeOf(nango.batchUpdate).parameter(0).not.toEqualTypeOf<never[]>();
                    expectTypeOf(nango.batchUpdate).parameter(1).toEqualTypeOf<'issue'>();

                    expectTypeOf(nango.batchDelete).parameter(0).not.toEqualTypeOf<never[]>();
                    expectTypeOf(nango.batchDelete).parameter(1).toEqualTypeOf<'issue'>();

                    expectTypeOf(nango.getMetadata()).toEqualTypeOf<Promise<{ test: string }>>();
                    expectTypeOf(nango.setMetadata).parameter(0).toEqualTypeOf<{ test: string }>();
                },
                onWebhook: async (nango) => {
                    await nango.log('Hello, world!');
                }
            });

            expect(sync).toStrictEqual({
                description: 'Fetch issues from GitHub',
                endpoints: [{ method: 'GET', path: '/github/issues' }],
                frequency: 'every hour',
                syncType: 'full',
                trackDeletes: false,
                autoStart: true,
                scopes: ['read:user', 'write:user'],
                metadata: expect.any(Object),
                webhookSubscriptions: [],
                type: 'sync',
                version: '0.0.1',
                models: expect.any(Object),
                exec: expect.any(Function),
                onWebhook: expect.any(Function)
            });
        });

        it('should correctly infer the type of the nango object when no models are provided', () => {
            createSync({
                description: 'Fetch issues from GitHub',
                endpoints: [{ method: 'GET', path: '/github/issues' }],
                frequency: 'every hour',
                syncType: 'full',
                models: {},
                exec: (nango) => {
                    expectTypeOf(nango.batchSave).parameter(0).toBeArray();
                    expectTypeOf(nango.batchSave).parameter(1).toBeNever();

                    expectTypeOf(nango.batchUpdate).parameter(0).toBeArray();
                    expectTypeOf(nango.batchUpdate).parameter(1).toBeNever();

                    expectTypeOf(nango.batchDelete).parameter(0).toBeArray();
                    expectTypeOf(nango.batchDelete).parameter(1).toBeNever();

                    expectTypeOf(nango.getMetadata()).toEqualTypeOf<Promise<never>>();
                    expectTypeOf(nango.setMetadata).parameter(0).toEqualTypeOf<never>();
                }
            });
        });
    });

    describe('createAction', () => {
        it('should create an action', () => {
            const action = createAction({
                description: 'Create a new issue in GitHub',
                endpoint: { method: 'POST', path: '/github/issues' },
                input: z.object({
                    title: z.string()
                }),
                output: z.object({
                    issueId: z.string()
                }),
                metadata: z.void(),
                scopes: ['read:user', 'write:user'],
                version: '0.0.1',
                exec: async (nango, input) => {
                    await nango.log('Hello, world!', input);
                    return { issueId: '123' };
                }
            });

            expect(action).toStrictEqual({
                description: 'Create a new issue in GitHub',
                endpoint: { method: 'POST', path: '/github/issues' },
                input: expect.any(Object),
                output: expect.any(Object),
                metadata: expect.any(Object),
                scopes: ['read:user', 'write:user'],
                version: '0.0.1',
                type: 'action',
                exec: expect.any(Function)
            });
        });
    });

    describe('createOnEvent', () => {
        it('should create an onEvent', () => {
            const onEvent = createOnEvent({
                description: 'Create a new issue in GitHub',
                event: 'post-connection-creation',
                metadata: z.void(),
                version: '0.0.1',
                exec: async (nango) => {
                    await nango.log('Hello, world!');
                }
            });

            expect(onEvent).toStrictEqual({
                description: 'Create a new issue in GitHub',
                event: 'post-connection-creation',
                metadata: expect.any(Object),
                version: '0.0.1',
                type: 'onEvent',
                exec: expect.any(Function)
            });
        });
    });
});
