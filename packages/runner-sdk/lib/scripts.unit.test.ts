/* eslint-disable @typescript-eslint/unbound-method */
import { describe, expect, expectTypeOf, it } from 'vitest';
import * as z from 'zod';

import { createAction, createFunction, createOnEvent, createSync, createWebhook } from './scripts.js';

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

        it('should create a sync without endpoints', () => {
            const sync = createSync({
                description: 'Fetch issues from GitHub',
                frequency: 'every hour',
                models: {
                    issue: z.object({ id: z.string() })
                },
                exec: async (nango) => {
                    await nango.log('Hello, world!');
                }
            });

            expect(sync).toStrictEqual({
                description: 'Fetch issues from GitHub',
                frequency: 'every hour',
                type: 'sync',
                models: expect.any(Object),
                exec: expect.any(Function)
            });
            expect(sync.endpoints).toBeUndefined();
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
        it('should create an action without endpoint', () => {
            const action = createAction({
                description: 'Create a new issue in GitHub',
                input: z.object({ title: z.string() }),
                output: z.object({ issueId: z.string() }),
                exec: async (nango, input) => {
                    await nango.log('Hello, world!', input);
                    return { issueId: '123' };
                }
            });

            expect(action).toStrictEqual({
                description: 'Create a new issue in GitHub',
                input: expect.any(Object),
                output: expect.any(Object),
                type: 'action',
                exec: expect.any(Function)
            });
            expect(action.endpoint).toBeUndefined();
        });

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

    describe('createFunction', () => {
        it('should create a function with explicit triggers', () => {
            const fn = createFunction({
                description: 'Handle contact updates',
                triggers: [
                    { kind: 'http', name: 'contacts-updated', debounce: { key: { body: '$.objectId' }, windowMs: 5000 } },
                    { kind: 'schedule', schedule: 'every hour' }
                ],
                exec: async (nango, event) => {
                    if (event.kind === 'http') {
                        expectTypeOf(event.request.body).toBeUnknown();
                    } else {
                        expectTypeOf(event.payload).toBeUnknown();
                    }
                    await nango.log('event', event.kind);
                }
            });

            expect(fn).toStrictEqual({
                description: 'Handle contact updates',
                triggers: [
                    { kind: 'http', name: 'contacts-updated', debounce: { key: { body: '$.objectId' }, windowMs: 5000 } },
                    { kind: 'schedule', schedule: 'every hour' }
                ],
                type: 'function',
                exec: expect.any(Function)
            });
        });

        it('should type the schedule payload from the input schema and expose models via data', () => {
            createFunction({
                triggers: [{ kind: 'schedule', schedule: 'every hour' }],
                input: z.object({ portalId: z.string() }),
                data: { models: { Contact: z.object({ id: z.string() }) } },
                exec: async (nango, event) => {
                    if (event.kind === 'schedule') {
                        expectTypeOf(event.payload).toEqualTypeOf<{ portalId: string }>();
                    }
                    // model names are typed from data.models
                    expectTypeOf(nango.batchSave).parameter(1).toEqualTypeOf<'Contact'>();
                    await nango.batchSave([{ id: '1' }], 'Contact');
                }
            });
        });
    });

    describe('createWebhook', () => {
        it('should desugar into a function with a single implicit http trigger', () => {
            const ingress = {
                validation: {
                    type: 'hmac' as const,
                    algorithm: 'sha256' as const,
                    header: 'x-signature',
                    encoding: 'hex' as const,
                    secret: { source: 'integrationConfig' as const, key: 'webhookSecret' }
                }
            };
            const webhook = createWebhook({
                name: 'contacts-updated',
                description: 'Contacts webhook',
                ingress,
                debounce: { key: { body: '$.portalId' }, windowMs: 5000 },
                exec: async (nango, event) => {
                    // Webhook bodies are provider-defined → request.body is unknown.
                    expectTypeOf(event.request.body).toBeUnknown();
                    await nango.log('event', event.request.body);
                }
            });

            expect(webhook.type).toBe('function');
            expect(webhook.name).toBe('contacts-updated');
            expect(webhook.triggers).toHaveLength(1);
            // ingress and debounce both live on the implicit http trigger
            expect(webhook.triggers[0]).toStrictEqual({
                kind: 'http',
                name: 'contacts-updated',
                ingress,
                debounce: { key: { body: '$.portalId' }, windowMs: 5000 }
            });
            // neither leaks to the function top level
            expect((webhook as unknown as Record<string, unknown>)['ingress']).toBeUndefined();
            expect((webhook as unknown as Record<string, unknown>)['debounce']).toBeUndefined();
        });

        it('should default the trigger name from the absence of name (left to the file basename downstream)', () => {
            const webhook = createWebhook({
                description: 'no name',
                exec: async (nango) => {
                    await nango.log('hi');
                }
            });

            expect(webhook.type).toBe('function');
            expect(webhook.name).toBeUndefined();
            expect(webhook.triggers).toHaveLength(1);
            expect(webhook.triggers[0]).toStrictEqual({ kind: 'http' });
        });
    });
});
