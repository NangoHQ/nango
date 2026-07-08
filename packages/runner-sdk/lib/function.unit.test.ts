/* eslint-disable @typescript-eslint/unbound-method */
import { describe, expect, expectTypeOf, it } from 'vitest';
import * as z from 'zod';

import { createFunction } from './function.js';

import type { OnEventType } from '@nangohq/types';

type Has<T, K extends PropertyKey> = K extends keyof T ? true : false;

describe('createFunction', () => {
    describe('schedule (sync)', () => {
        it('computes capabilities and exposes records + checkpoint + metadata + proxy', () => {
            const fn = createFunction({
                description: 'Fetch issues from GitHub',
                data: {
                    models: { GithubIssue: z.object({ id: z.string(), title: z.string() }) },
                    checkpoint: z.object({ lastId: z.string() }),
                    metadata: z.object({ org: z.string() })
                },
                trigger: { kind: 'schedule', frequency: 'every 2h', autoStart: true },
                exec: async (nango, trigger) => {
                    await nango.batchSave([{ id: '1', title: 't' }], 'GithubIssue');
                    await nango.batchUpdate([{ id: '1', title: 't' }], 'GithubIssue');
                    await nango.batchDelete([{ id: '1', title: 't' }], 'GithubIssue');
                    await nango.trackDeletesStart('GithubIssue');
                    await nango.trackDeletesEnd('GithubIssue');
                    const cp = await nango.getCheckpoint();
                    await nango.saveCheckpoint({ lastId: '1' });
                    await nango.getMetadata();

                    expectTypeOf<Has<typeof nango, 'proxy'>>().toEqualTypeOf<true>();
                    expectTypeOf(nango.batchSave).parameter(1).toEqualTypeOf<'GithubIssue'>();
                    expectTypeOf(cp).toEqualTypeOf<{ lastId: string } | undefined>();
                    expectTypeOf(nango.getMetadata()).toEqualTypeOf<Promise<{ org: string }>>();
                    expectTypeOf(trigger.kind).toEqualTypeOf<'schedule'>();
                    expectTypeOf(trigger.input).toEqualTypeOf<null>();
                }
            });

            expect(fn.type).toBe('function');
            expect(fn.capabilities).toStrictEqual({
                useRecords: true,
                useCheckpoints: true,
                useMetadata: true,
                useOutbound: true,
                useInvoke: false
            });
        });

        it('disallows a declared input on schedule and event triggers', () => {
            createFunction({
                description: 'schedule cannot declare input',
                // @ts-expect-error schedule triggers carry no caller input
                input: z.object({ since: z.string() }),
                trigger: { kind: 'schedule', frequency: 'every hour' },
                exec: (_nango, trigger) => {
                    expectTypeOf(trigger.input).toEqualTypeOf<null>();
                }
            });

            createFunction({
                description: 'event cannot declare input',
                // @ts-expect-error event triggers carry no caller input
                input: z.object({ since: z.string() }),
                trigger: { kind: 'event', events: ['pre-connection-deletion'] },
                exec: (_nango, trigger) => {
                    expectTypeOf(trigger.input).toEqualTypeOf<{ event: OnEventType }>();
                }
            });
        });
    });

    describe('http with models (webhook)', () => {
        it('exposes record capability and types the http payload from the trigger input', () => {
            const fn = createFunction({
                description: 'Handle GitHub issue webhooks',
                input: z.object({ action: z.string() }),
                data: { models: { GithubIssue: z.object({ id: z.string() }) } },
                trigger: { kind: 'http', subscriptions: ['issues.opened'] },
                exec: async (nango, trigger) => {
                    await nango.batchSave([{ id: '1' }], 'GithubIssue');

                    expectTypeOf<Has<typeof nango, 'batchSave'>>().toEqualTypeOf<true>();
                    expectTypeOf(trigger.kind).toEqualTypeOf<'http'>();
                    expectTypeOf(trigger.input).toEqualTypeOf<{ action: string }>();
                    expectTypeOf(trigger.request.headers).toEqualTypeOf<Record<string, string>>();
                }
            });

            expect(fn.capabilities).toStrictEqual({
                useRecords: true,
                useCheckpoints: false,
                useMetadata: false,
                useOutbound: true,
                useInvoke: false
            });
        });

        it('types the input as an array when debounce take is "all"', () => {
            createFunction({
                description: 'Handle coalesced webhooks',
                input: z.object({ action: z.string() }),
                trigger: { kind: 'http', debounce: { windowMs: 5000, take: 'all' } },
                exec: (_nango, trigger) => {
                    expectTypeOf(trigger.input).toEqualTypeOf<{ action: string }[]>();
                }
            });

            createFunction({
                description: 'Handle latest webhook',
                input: z.object({ action: z.string() }),
                trigger: { kind: 'http', debounce: { windowMs: 5000, take: 'latest' } },
                exec: (_nango, trigger) => {
                    expectTypeOf(trigger.input).toEqualTypeOf<{ action: string }>();
                }
            });
        });
    });

    describe('http without models (action)', () => {
        it('has no record methods, types input and output', () => {
            const fn = createFunction({
                description: 'Create a GitHub issue',
                input: z.object({ title: z.string() }),
                output: z.object({ issueId: z.string() }),
                trigger: { kind: 'http' },
                exec: (_nango, trigger) => {
                    expectTypeOf<Has<typeof _nango, 'proxy'>>().toEqualTypeOf<true>();
                    expectTypeOf<Has<typeof _nango, 'batchSave'>>().toEqualTypeOf<false>();
                    expectTypeOf(trigger.input).toEqualTypeOf<{ title: string }>();
                    return { issueId: '123' };
                }
            });

            expect(fn.capabilities.useRecords).toBe(false);
            expect(fn.capabilities.useOutbound).toBe(true);
        });
    });

    describe('event', () => {
        it('exposes the lifecycle event payload', () => {
            const fn = createFunction({
                description: 'Run before a connection is deleted',
                trigger: { kind: 'event', events: ['pre-connection-deletion'] },
                exec: async (nango, trigger) => {
                    await nango.log('executed');
                    expectTypeOf(trigger.kind).toEqualTypeOf<'event'>();
                    expectTypeOf(trigger.input).toEqualTypeOf<{ event: OnEventType }>();
                }
            });

            expect(fn.capabilities.useRecords).toBe(false);
        });
    });

    describe('requires', () => {
        it('exposes invoke and removes proxy when requires disables it', () => {
            const child = createFunction({
                description: 'child',
                input: z.object({ q: z.string() }),
                output: z.object({ n: z.number() }),
                exec: (_nango, trigger) => {
                    expectTypeOf(trigger.kind).toEqualTypeOf<'invoke'>();
                    expectTypeOf(trigger.input).toEqualTypeOf<{ q: string }>();
                    return { n: 1 };
                }
            });

            const fn = createFunction({
                description: 'dispatcher',
                requires: { outbound: false, invoke: true },
                trigger: { kind: 'schedule', frequency: 'every hour' },
                exec: async (nango) => {
                    expectTypeOf<Has<typeof nango, 'invoke'>>().toEqualTypeOf<true>();
                    expectTypeOf<Has<typeof nango, 'proxy'>>().toEqualTypeOf<false>();
                    const res = await nango.invoke(child, { input: { q: 'x' } });
                    expectTypeOf(res).toEqualTypeOf<{ n: number }>();
                }
            });

            expect(fn.capabilities).toStrictEqual({
                useRecords: false,
                useCheckpoints: false,
                useMetadata: false,
                useOutbound: false,
                useInvoke: true
            });
        });

        it('invoke types its input from the target, regardless of trigger kind', () => {
            const httpFn = createFunction({
                description: 'http target',
                input: z.object({ title: z.string() }),
                output: z.object({ ok: z.boolean() }),
                trigger: { kind: 'http', debounce: { windowMs: 1000, take: 'all' } },
                exec: () => ({ ok: true })
            });

            const scheduleFn = createFunction({
                description: 'schedule target',
                trigger: { kind: 'schedule', frequency: 'every hour' },
                exec: () => {}
            });

            createFunction({
                description: 'dispatcher',
                requires: { outbound: false, invoke: true },
                trigger: { kind: 'schedule', frequency: 'every hour' },
                exec: async (nango) => {
                    // http target: invoke passes the single declared input (not the coalesced array)
                    const httpRes = await nango.invoke(httpFn, { input: { title: 'x' } });
                    expectTypeOf(httpRes).toEqualTypeOf<{ ok: boolean }>();

                    // @ts-expect-error http input must match the declared input schema
                    await nango.invoke(httpFn, { input: { wrong: 1 } });

                    // @ts-expect-error required input cannot be skipped
                    await nango.invoke(httpFn);

                    // schedule target: no declared input
                    await nango.invoke(scheduleFn);

                    // a widened/opaque function reference is rejected
                    const opaque = httpFn as { type: 'function' };
                    // @ts-expect-error opaque reference does not satisfy the invoke target constraint
                    await nango.invoke(opaque, { input: { title: 'x' } });
                }
            });
        });

        it('connection-less function can only searchConnections and invoke', () => {
            createFunction({
                description: 'resolves connections at runtime',
                requires: { connection: false, invoke: true },
                trigger: { kind: 'schedule', frequency: 'every hour' },
                exec: async (nango) => {
                    await nango.searchConnections({ provider: 'github' });
                    expectTypeOf<Has<typeof nango, 'searchConnections'>>().toEqualTypeOf<true>();
                    expectTypeOf<Has<typeof nango, 'invoke'>>().toEqualTypeOf<true>();

                    expectTypeOf<Has<typeof nango, 'getConnection'>>().toEqualTypeOf<false>();
                    expectTypeOf<Has<typeof nango, 'batchSave'>>().toEqualTypeOf<false>();
                }
            });
        });
    });

    describe('no models', () => {
        it('does not expose record/checkpoint/metadata methods', () => {
            createFunction({
                description: 'no models',
                trigger: { kind: 'schedule', frequency: 'every hour' },
                exec: (_nango) => {
                    expectTypeOf<Has<typeof _nango, 'batchSave'>>().toEqualTypeOf<false>();
                    expectTypeOf<Has<typeof _nango, 'getCheckpoint'>>().toEqualTypeOf<false>();
                    expectTypeOf<Has<typeof _nango, 'getMetadata'>>().toEqualTypeOf<false>();
                }
            });
        });
    });

    describe('limits.concurrency.perConnection', () => {
        it('is fixed to 1 for schedule triggers and a ConcurrencyLimit otherwise', () => {
            createFunction({
                description: 'scheduled',
                trigger: { kind: 'schedule', frequency: 'every hour' },
                limits: { concurrency: { perConnection: 1 } },
                exec: () => {}
            });

            createFunction({
                description: 'http can overlap runs for a connection',
                trigger: { kind: 'http' },
                limits: { concurrency: { perConnection: 'max' } },
                exec: () => {}
            });

            createFunction({
                description: 'schedule function cannot overlap',
                trigger: { kind: 'schedule', frequency: 'every hour' },
                // @ts-expect-error schedule triggers are pinned to perConnection: 1
                limits: { concurrency: { perConnection: 'max' } },
                exec: () => {}
            });
        });
    });
});
