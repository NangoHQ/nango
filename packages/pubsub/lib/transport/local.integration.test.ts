/* eslint-disable import/order */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { LocalTransport } from './local.js';

import type { Event } from '../event.js';
import type { DBTeam, DBUser } from '@nangohq/types';

describe('LocalTransport', () => {
    let transport: LocalTransport;

    beforeEach(async () => {
        transport = new LocalTransport();
        await transport.connect();
    });

    afterEach(async () => {
        await transport.disconnect();
    });

    it('should publish and subscribe to events without blocking', async () => {
        const events: Event[] = [];
        let callbackExecuted = false;

        // Subscribe to events
        transport.subscribe({
            consumerGroup: 'test-group',
            subscriptions: [
                {
                    subject: 'user',
                    callback: (event: Event) => {
                        events.push(event);
                        callbackExecuted = true;
                    }
                }
            ]
        });

        // Publish an event
        const publishResult = await transport.publish({
            idempotencyKey: 'test-key',
            subject: 'user',
            type: 'user.created',
            payload: {
                user: { id: 123, name: 'Test User' } as DBUser,
                team: { id: 456, name: 'Test Team' } as DBTeam
            },
            createdAt: new Date()
        });

        expect(publishResult.isOk()).toBe(true);

        // Immediately after publish, the callback should NOT have been executed yet
        expect(callbackExecuted).toBe(false);
        expect(events).toHaveLength(0);

        // Wait for the next tick of the event loop where setImmediate callbacks run
        await new Promise((resolve) => setImmediate(resolve));

        // The callback should now have been executed (since it uses setImmediate)
        expect(callbackExecuted).toBe(true);
        expect(events).toHaveLength(1);

        expect(events[0]?.subject).toBe('user');
        expect(events[0]?.type).toBe('user.created');
    });

    it('should handle multiple subscribers for the same subject', async () => {
        const events1: Event[] = [];
        const events2: Event[] = [];

        // Subscribe with two different consumer groups
        transport.subscribe({
            consumerGroup: 'group1',
            subscriptions: [
                {
                    subject: 'user',
                    callback: (event: Event) => {
                        events1.push(event);
                    }
                }
            ]
        });

        transport.subscribe({
            consumerGroup: 'group2',
            subscriptions: [
                {
                    subject: 'user',
                    callback: (event: Event) => {
                        events2.push(event);
                    }
                }
            ]
        });

        // Publish an event
        await transport.publish({
            idempotencyKey: 'test-key',
            subject: 'user',
            type: 'user.created',
            payload: {
                user: { id: 123, name: 'Test User' } as DBUser,
                team: { id: 456, name: 'Test Team' } as DBTeam
            },
            createdAt: new Date()
        });

        // Wait for the next tick of the event loop where setImmediate callbacks run
        await new Promise((resolve) => setImmediate(resolve));

        // Both subscribers should receive the event
        expect(events1).toHaveLength(1);
        expect(events2).toHaveLength(1);
        expect(events1[0]?.idempotencyKey).toBe('test-key');
        expect(events2[0]?.idempotencyKey).toBe('test-key');
    });

    it('should handle errors in callbacks gracefully', async () => {
        let successCallbackExecuted = false;

        transport.subscribe({
            consumerGroup: 'test-group',
            subscriptions: [
                {
                    subject: 'user',
                    callback: () => {
                        throw new Error('Test error');
                    }
                },
                {
                    subject: 'billing',
                    callback: () => {
                        successCallbackExecuted = true;
                    }
                }
            ]
        });

        // Publish events
        await transport.publish({
            idempotencyKey: 'error-test',
            subject: 'user',
            type: 'user.created',
            payload: {
                user: { id: 123, name: 'Test User' } as DBUser,
                team: { id: 456, name: 'Test Team' } as DBTeam
            },
            createdAt: new Date()
        });

        await transport.publish({
            idempotencyKey: 'success-test',
            subject: 'billing',
            type: 'billing.metric',
            payload: [{ type: 'billable_actions', value: 1, properties: { accountId: 1 } }],
            createdAt: new Date()
        });

        // Wait for callbacks to execute
        await new Promise((resolve) => setImmediate(resolve));

        // Error in one callback should not affect others
        expect(successCallbackExecuted).toBe(true);
    });

    it('should not invoke callbacks for different subjects', async () => {
        const userEvents: Event[] = [];
        const billingEvents: Event[] = [];
        let userCallbackExecuted = false;
        let billingCallbackExecuted = false;

        // Subscribe to different subjects
        transport.subscribe({
            consumerGroup: 'test-group',
            subscriptions: [
                {
                    subject: 'user',
                    callback: (event: Event) => {
                        userEvents.push(event);
                        userCallbackExecuted = true;
                    }
                },
                {
                    subject: 'billing',
                    callback: (event: Event) => {
                        billingEvents.push(event);
                        billingCallbackExecuted = true;
                    }
                }
            ]
        });

        // Publish an event for 'user' subject only
        await transport.publish({
            idempotencyKey: 'user-only-test',
            subject: 'user',
            type: 'user.created',
            payload: {
                user: { id: 123, name: 'Test User' } as DBUser,
                team: { id: 456, name: 'Test Team' } as DBTeam
            },
            createdAt: new Date()
        });

        // Wait for the next tick of the event loop where setImmediate callbacks run
        await new Promise((resolve) => setImmediate(resolve));

        // Only the 'user' callback should be executed
        expect(userCallbackExecuted).toBe(true);
        expect(billingCallbackExecuted).toBe(false);
        expect(userEvents).toHaveLength(1);
        expect(billingEvents).toHaveLength(0);
        expect(userEvents[0]?.subject).toBe('user');
        expect(userEvents[0]?.idempotencyKey).toBe('user-only-test');
    });
});
