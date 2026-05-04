import { assert, describe, expect, it, vi } from 'vitest';

import { Err, Ok } from '@nangohq/utils';

import { Migration } from './migration.js';

import type { MigrationTransportError } from './migration.js';
import type { Transport } from './transport.js';
import type { Event } from '@nangohq/types';

function mockTransport(partial?: Partial<Transport>): Transport {
    return {
        connect: vi.fn().mockResolvedValue(Ok(undefined)),
        disconnect: vi.fn().mockResolvedValue(Ok(undefined)),
        publish: vi.fn().mockResolvedValue(Ok(undefined)),
        subscribe: vi.fn(),
        ...partial
    };
}

function usageEvent(): Event {
    return {
        idempotencyKey: 'idem-1',
        subject: 'usage',
        type: 'usage.actions',
        payload: {
            value: 1,
            properties: {
                accountId: 1,
                connectionId: 'c1',
                environmentId: 2,
                environmentName: 'env',
                integrationId: 'int',
                actionName: 'act'
            }
        },
        createdAt: new Date()
    };
}

function getMigrationTransportError(err: unknown): MigrationTransportError {
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).name).toBe('MigrationTransportError');
    return err as MigrationTransportError;
}

describe('Migration transport', () => {
    it('connect returns Ok when all transports succeed', async () => {
        const connectA = vi.fn().mockResolvedValue(Ok(undefined));
        const connectB = vi.fn().mockResolvedValue(Ok(undefined));
        const a = mockTransport({ connect: connectA });
        const b = mockTransport({ connect: connectB });
        const c = new Migration(a, [b]);
        const res = await c.connect();
        assert(res.isOk());
        expect(connectA).toHaveBeenCalledTimes(1);
        expect(connectB).toHaveBeenCalledTimes(1);
    });

    it('connect returns MigrationTransportError with one cause when a single transport fails', async () => {
        const inner = new Error('only one broke');
        const a = mockTransport({
            connect: vi.fn().mockResolvedValue(Err(inner))
        });
        const b = mockTransport();
        const c = new Migration(a, [b]);
        const res = await c.connect();
        assert(res.isErr());
        const combinedErr = getMigrationTransportError(res.error);
        expect(combinedErr.causes).toEqual([inner]);
        expect(combinedErr.message).toContain('connect failed');
        expect(combinedErr.message).toContain('only one broke');
    });

    it('connect aggregates errors when multiple transports fail', async () => {
        const e1 = new Error('first');
        const e2 = new Error('second');
        const a = mockTransport({
            connect: vi.fn().mockResolvedValue(Err(e1))
        });
        const b = mockTransport({
            connect: vi.fn().mockResolvedValue(Err(e2))
        });
        const c = new Migration(a, [b]);
        const res = await c.connect();
        assert(res.isErr());
        const combinedErr = getMigrationTransportError(res.error);
        expect(combinedErr.causes).toEqual([e1, e2]);
        expect(combinedErr.message).toContain('(2 transports)');
        expect(combinedErr.message).toContain('first');
        expect(combinedErr.message).toContain('second');
    });

    it('disconnect merges errors the same way as connect', async () => {
        const e1 = new Error('d1');
        const e2 = new Error('d2');
        const a = mockTransport({
            disconnect: vi.fn().mockResolvedValue(Err(e1))
        });
        const b = mockTransport({
            disconnect: vi.fn().mockResolvedValue(Err(e2))
        });
        const c = new Migration(a, [b]);
        const res = await c.disconnect();
        assert(res.isErr());
        const err = getMigrationTransportError(res.error);
        expect(err.causes).toEqual([e1, e2]);
        expect(err.message).toContain('disconnect failed');
    });

    it('publish returns the publisher error without wrapping when publish fails', async () => {
        const e1 = new Error('p1');
        const publishPublisher = vi.fn().mockResolvedValue(Err(e1));
        const publishSubscriber = vi.fn().mockResolvedValue(Ok(undefined));
        const publisher = mockTransport({ publish: publishPublisher });
        const subscriber = mockTransport({ publish: publishSubscriber });
        const c = new Migration(publisher, [subscriber]);
        const event = usageEvent();
        const res = await c.publish(event);
        assert(res.isErr());
        expect(res.error).toBe(e1);
        expect(publishPublisher).toHaveBeenCalledWith(event);
        expect(publishSubscriber).not.toHaveBeenCalled();
    });

    it('publish returns Ok when the publisher succeeds', async () => {
        const publishPublisher = vi.fn().mockResolvedValue(Ok(undefined));
        const publishSubscriber = vi.fn().mockResolvedValue(Ok(undefined));
        const publisher = mockTransport({ publish: publishPublisher });
        const subscriber = mockTransport({ publish: publishSubscriber });
        const c = new Migration(publisher, [subscriber]);
        const event = usageEvent();
        const res = await c.publish(event);
        assert(res.isOk());
        expect(publishPublisher).toHaveBeenCalledWith(event);
        expect(publishSubscriber).not.toHaveBeenCalled();
    });

    it('subscribe forwards only to subscriber transports, not the publisher', () => {
        const subscribePublisher = vi.fn();
        const subscribeSubscriber = vi.fn();
        const publisher = mockTransport({ subscribe: subscribePublisher });
        const subscriber = mockTransport({ subscribe: subscribeSubscriber });
        const c = new Migration(publisher, [subscriber]);
        const params = { consumerGroup: 'g', subject: 'usage' as const, callback: vi.fn() };
        c.subscribe(params);
        expect(subscribePublisher).not.toHaveBeenCalled();
        expect(subscribeSubscriber).toHaveBeenCalledWith(params);
    });

    it('handles an empty transport list', async () => {
        const c = new Migration(mockTransport(), []);
        assert((await c.connect()).isOk());
        assert((await c.disconnect()).isOk());
        assert((await c.publish(usageEvent())).isOk());
    });

    it('invokes connects in parallel', async () => {
        const events: string[] = [];
        const a = mockTransport({
            connect: vi.fn(async () => {
                events.push('a-start');
                await new Promise((r) => setTimeout(r, 25));
                events.push('a-end');
                return Ok(undefined);
            })
        });
        const b = mockTransport({
            connect: vi.fn(async () => {
                events.push('b-start');
                await new Promise((r) => setTimeout(r, 5));
                events.push('b-end');
                return Ok(undefined);
            })
        });
        const publisher = mockTransport();
        const c = new Migration(publisher, [a, b]);
        await c.connect();
        const bStart = events.indexOf('b-start');
        const aEnd = events.indexOf('a-end');
        expect(bStart).toBeGreaterThan(-1);
        expect(aEnd).toBeGreaterThan(-1);
        expect(bStart).toBeLessThan(aEnd);
    });
});
