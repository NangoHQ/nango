import { afterEach, describe, expect, it, vi } from 'vitest';

describe('dispatchQueuePublisher', () => {
    afterEach(() => {
        vi.resetModules();
        vi.unmock('../../env.js');
    });

    it('wires batch size and publish concurrency from envs', async () => {
        vi.doMock('../../env.js', () => ({
            envs: {
                AWS_REGION: 'eu-west-1',
                NANGO_TASK_DISPATCH_QUEUE_URL: 'https://sqs.us-west-2.amazonaws.com/123456789012/nango-task-dispatch-development',
                NANGO_TASK_DISPATCH_PUBLISH_BATCH_SIZE: 8,
                NANGO_TASK_DISPATCH_PUBLISH_CONCURRENCY: 3
            }
        }));

        const { dispatchQueuePublisher } = await import('./client.js');
        const publisher = dispatchQueuePublisher as any;

        expect(publisher).not.toBeNull();
        expect(publisher.batchSize).toBe(8);
        expect(publisher.publishConcurrency).toBe(3);
    });

    it('rejects fifo queue urls', async () => {
        vi.doMock('../../env.js', () => ({
            envs: {
                AWS_REGION: 'eu-west-1',
                NANGO_TASK_DISPATCH_QUEUE_URL: 'https://sqs.us-west-2.amazonaws.com/123456789012/nango-task-dispatch-development.fifo',
                NANGO_TASK_DISPATCH_PUBLISH_BATCH_SIZE: 10,
                NANGO_TASK_DISPATCH_PUBLISH_CONCURRENCY: 2
            }
        }));

        await expect(import('./client.js')).rejects.toThrow('Webhook dispatch queue must be a Standard SQS queue');
    });

    it('rejects fifo queue urls with trailing slash', async () => {
        vi.doMock('../../env.js', () => ({
            envs: {
                AWS_REGION: 'eu-west-1',
                NANGO_TASK_DISPATCH_QUEUE_URL: 'https://sqs.us-west-2.amazonaws.com/123456789012/nango-task-dispatch-development.fifo/',
                NANGO_TASK_DISPATCH_PUBLISH_BATCH_SIZE: 10,
                NANGO_TASK_DISPATCH_PUBLISH_CONCURRENCY: 2
            }
        }));

        await expect(import('./client.js')).rejects.toThrow('Webhook dispatch queue must be a Standard SQS queue');
    });
});
