import { afterEach, assert, beforeEach, describe, expect, it, vi } from 'vitest';

import { ActiveMQ } from './activemq.js';

import type { Event } from '../event.js';

describe('ActiveMQ Transport', () => {
    it('should connect successfully', async () => {
        const activemq = new ActiveMQ();
        const res = await activemq.connect({ timeoutMs: 1000 });
        assert(res.isOk(), 'Connecting to ActiveMQ was not successful');
    });

    it('should handle connection error', async () => {
        const activemq = new ActiveMQ({ url: 'ws://invalid:12345/ws', user: '', password: '' });
        const res = await activemq.connect({ timeoutMs: 1000 });
        assert(res.isErr(), 'Expected connection to fail with invalid URL');
    });

    it('should disconnect successfully', async () => {
        const activemq = new ActiveMQ();
        await activemq.connect({ timeoutMs: 1000 });
        const res = await activemq.disconnect();
        assert(res.isOk(), 'Disconnecting was not successful');
    });

    describe('Publisher/Subscriber', () => {
        const publisher = new ActiveMQ();
        const consumer = new ActiveMQ();

        beforeEach(async () => {
            await publisher.connect({ timeoutMs: 1000 });
            await consumer.connect({ timeoutMs: 1000 });
        });

        afterEach(async () => {
            await publisher.disconnect();

            consumer.unsubscribeAll();
            await consumer.disconnect();
        });
        it('should publish and consume event', async () => {
            const event: Event = {
                idempotencyKey: '123456',
                subject: 'usage',
                type: 'usage.actions',
                payload: {
                    value: 10,
                    accountId: 1,
                    properties: {
                        tag1: 'someTag1'
                    }
                },
                createdAt: new Date()
            };
            const callback = vi.fn();
            consumer.subscribe({
                consumerGroup: 'test-consumer-group',
                subscriptions: [
                    {
                        subject: event.subject,
                        callback
                    }
                ]
            });

            const published = await publisher.publish(event);
            assert(published.isOk(), 'Publishing event was not successful');
            await vi.waitFor(() => {
                expect(callback).toHaveBeenCalledTimes(1);
            });
            expect(callback).toHaveBeenCalledWith(event);
        });
        it('should persist subscription after reconnecting', async () => {
            const event: Event = {
                idempotencyKey: '1234567',
                subject: 'usage',
                type: 'usage.actions',
                payload: {
                    value: 20,
                    accountId: 2,
                    properties: {
                        tag2: 'someTag2'
                    }
                },
                createdAt: new Date()
            };
            const callback = vi.fn();
            consumer.subscribe({
                consumerGroup: 'test-consumer-group',
                subscriptions: [
                    {
                        subject: event.subject,
                        callback
                    }
                ]
            });

            await consumer.disconnect();
            await consumer.connect({ timeoutMs: 1000 });

            const published = await publisher.publish(event);
            assert(published.isOk(), 'Re-publishing event after reconnect was not successful');
            await vi.waitFor(() => {
                expect(callback).toHaveBeenCalledTimes(1);
            });
            expect(callback).toHaveBeenCalledWith(event);
        });
    });
});
