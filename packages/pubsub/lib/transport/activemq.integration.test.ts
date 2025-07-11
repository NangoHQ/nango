import { afterAll, assert, beforeAll, describe, expect, it, vi } from 'vitest';

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
        beforeAll(async () => {
            await publisher.connect({ timeoutMs: 1000 });
            await consumer.connect({ timeoutMs: 1000 });
        });

        afterAll(async () => {
            await publisher.disconnect();
            await consumer.disconnect();
        });
        it('should publish and consume event', async () => {
            const event: Event = {
                idempotencyKey: 'test-idempotency-key',
                subject: 'billing',
                type: 'billing.metric',
                payload: [
                    {
                        type: 'billable_actions',
                        value: 10,
                        properties: {
                            accountId: 1,
                            idempotencyKey: '12345',
                            tag1: 'value1'
                        }
                    }
                ],
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
    });
});
