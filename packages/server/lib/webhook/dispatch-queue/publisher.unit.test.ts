import { SendMessageBatchCommand } from '@aws-sdk/client-sqs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const tracerMocks = vi.hoisted(() => {
    const span = {
        setTag: vi.fn().mockReturnThis(),
        finish: vi.fn()
    };
    const activeSpan = {
        traceId: 'active-trace',
        setTag: vi.fn().mockReturnThis()
    };

    return {
        activeSpan,
        active: vi.fn(() => activeSpan),
        activate: vi.fn(async (_span, callback: () => Promise<unknown>) => await callback()),
        startSpan: vi.fn(() => span),
        span,
        dogstatsd: {
            increment: vi.fn(),
            decrement: vi.fn(),
            gauge: vi.fn(),
            histogram: vi.fn(),
            distribution: vi.fn()
        }
    };
});

vi.mock('dd-trace', () => {
    return {
        default: {
            scope: () => ({ active: tracerMocks.active, activate: tracerMocks.activate }),
            startSpan: tracerMocks.startSpan,
            dogstatsd: tracerMocks.dogstatsd
        }
    };
});

import { DispatchQueuePublisher } from './publisher.js';

import type { SQSClient, SendMessageBatchCommandOutput } from '@aws-sdk/client-sqs';
import type { WebhookDispatchMessage } from '@nangohq/types';

function buildMessage(overrides: Partial<WebhookDispatchMessage> = {}): WebhookDispatchMessage {
    return {
        version: 1,
        kind: 'webhook',
        taskName: 'webhook:abc123',
        createdAt: '2026-04-23T00:00:00.000Z',
        accountId: 1,
        integrationId: 3,
        provider: 'github',
        parentSyncName: 'sync-1',
        activityLogId: 'log-1',
        webhookName: 'sync-1',
        connection: { id: 42, connection_id: 'conn-1', provider_config_key: 'github-dev', environment_id: 2 },
        payload: { hello: 'world' },
        ...overrides
    };
}

function makeSqsMock(
    responder: (command: SendMessageBatchCommand, callIndex: number) => SendMessageBatchCommandOutput | Promise<SendMessageBatchCommandOutput>
): { sqs: SQSClient; send: ReturnType<typeof vi.fn> } {
    const send = vi.fn();
    let callIndex = 0;
    send.mockImplementation(async (command: unknown) => {
        if (!(command instanceof SendMessageBatchCommand)) {
            throw new Error(`Unexpected command: ${String(command)}`);
        }
        return await responder(command, callIndex++);
    });
    return { sqs: { send } as unknown as SQSClient, send };
}

function successfulBatchResponse(command: SendMessageBatchCommand): SendMessageBatchCommandOutput {
    return {
        $metadata: {},
        Successful: (command.input.Entries ?? []).map((e) => ({ Id: e.Id!, MessageId: 'x', MD5OfMessageBody: 'x' })),
        Failed: []
    };
}

function deferred<T>() {
    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
}

describe('DispatchQueuePublisher', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        tracerMocks.active.mockClear();
        tracerMocks.activate.mockClear();
        tracerMocks.startSpan.mockClear();
        tracerMocks.span.setTag.mockClear();
        tracerMocks.span.finish.mockClear();
        tracerMocks.activeSpan.setTag.mockClear();
        tracerMocks.dogstatsd.increment.mockClear();
        tracerMocks.dogstatsd.decrement.mockClear();
        tracerMocks.dogstatsd.gauge.mockClear();
        tracerMocks.dogstatsd.histogram.mockClear();
        tracerMocks.dogstatsd.distribution.mockClear();
    });

    it('throws on invalid batchSize', () => {
        const { sqs } = makeSqsMock(() => ({ $metadata: {}, Successful: [], Failed: [] }));
        expect(() => new DispatchQueuePublisher({ sqs, queueUrl: 'http://q', batchSize: 0 })).toThrow('batchSize must be > 0');
        expect(() => new DispatchQueuePublisher({ sqs, queueUrl: 'http://q', batchSize: -1 })).toThrow('batchSize must be > 0');
    });

    it('throws on invalid publishConcurrency', () => {
        const { sqs } = makeSqsMock(() => ({ $metadata: {}, Successful: [], Failed: [] }));
        expect(() => new DispatchQueuePublisher({ sqs, queueUrl: 'http://q', publishConcurrency: 0 })).toThrow('publishConcurrency must be > 0');
    });

    it('returns {enqueued:0,failed:0} for empty input', async () => {
        const { sqs, send } = makeSqsMock(() => ({ $metadata: {}, Successful: [], Failed: [] }));
        const publisher = new DispatchQueuePublisher({ sqs, queueUrl: 'http://q' });
        const res = await publisher.publish([], 'account:1:env:2');
        expect(res).toEqual({ enqueued: 0, failed: 0 });
        expect(send.mock.calls).toHaveLength(0);
    });

    it('chunks into batches of <=10 for a 25-message input', async () => {
        const { sqs, send } = makeSqsMock((cmd) => successfulBatchResponse(cmd));
        const publisher = new DispatchQueuePublisher({ sqs, queueUrl: 'http://q' });
        const messages = Array.from({ length: 25 }, () => buildMessage());
        const res = await publisher.publish(messages, 'account:1:env:2');
        expect(res).toEqual({ enqueued: 25, failed: 0 });
        expect(send.mock.calls).toHaveLength(3);
        const entryCounts = send.mock.calls.map((call) => (call[0] as SendMessageBatchCommand).input.Entries?.length);
        expect(entryCounts).toEqual([10, 10, 5]);
        expect(tracerMocks.startSpan).toHaveBeenCalledWith('webhook.dispatch.publish', {
            childOf: expect.objectContaining({ traceId: 'active-trace' }),
            tags: expect.objectContaining({
                'nango.accountId': 1,
                'nango.environmentId': 2,
                'nango.integrationId': 3,
                'nango.provider': 'github',
                'nango.providerConfigKey': 'github-dev',
                'nango.messageCount': 25,
                'nango.batchCount': 3
            })
        });
        expect(tracerMocks.activate).toHaveBeenCalledWith(tracerMocks.span, expect.any(Function));
        expect(tracerMocks.span.setTag).toHaveBeenCalledWith('nango.enqueued', 25);
        expect(tracerMocks.span.setTag).toHaveBeenCalledWith('nango.failed', 0);
        expect(tracerMocks.span.setTag).toHaveBeenCalledWith('nango.retriedEntries', 0);
        expect(tracerMocks.span.setTag).toHaveBeenCalledWith('nango.retriedBatches', 0);
        expect(tracerMocks.dogstatsd.increment).toHaveBeenCalledTimes(1);
        expect(tracerMocks.dogstatsd.increment).toHaveBeenCalledWith('nango.webhook.dispatch_queue.publish.success', 25, { provider: 'github' });
        expect(tracerMocks.span.finish).toHaveBeenCalledTimes(1);
    });

    it('sets MessageGroupId on every entry', async () => {
        const groupId = 'account:7:env:9';
        const seen: string[] = [];
        const { sqs } = makeSqsMock((cmd) => {
            for (const entry of cmd.input.Entries ?? []) {
                if (entry.MessageGroupId) seen.push(entry.MessageGroupId);
            }
            return successfulBatchResponse(cmd);
        });
        const publisher = new DispatchQueuePublisher({ sqs, queueUrl: 'http://q' });
        await publisher.publish([buildMessage(), buildMessage()], groupId);
        expect(seen).toEqual([groupId, groupId]);
    });

    it('limits concurrent batch publishes to publishConcurrency', async () => {
        const responses = Array.from({ length: 4 }, () => deferred<SendMessageBatchCommandOutput>());
        let inFlight = 0;
        let maxInFlight = 0;

        const { sqs, send } = makeSqsMock((_, call) => {
            inFlight += 1;
            maxInFlight = Math.max(maxInFlight, inFlight);
            return responses[call]!.promise.finally(() => {
                inFlight -= 1;
            });
        });

        const publisher = new DispatchQueuePublisher({ sqs, queueUrl: 'http://q', batchSize: 1, publishConcurrency: 2 });
        const publishPromise = publisher.publish(
            Array.from({ length: 4 }, () => buildMessage()),
            'account:1:env:2'
        );

        await vi.waitFor(() => {
            expect(send.mock.calls).toHaveLength(2);
        });
        expect(maxInFlight).toBe(2);

        responses[0]!.resolve(successfulBatchResponse(send.mock.calls[0]![0] as SendMessageBatchCommand));
        responses[1]!.resolve(successfulBatchResponse(send.mock.calls[1]![0] as SendMessageBatchCommand));

        await vi.waitFor(() => {
            expect(send.mock.calls).toHaveLength(4);
        });
        expect(maxInFlight).toBe(2);

        responses[2]!.resolve(successfulBatchResponse(send.mock.calls[2]![0] as SendMessageBatchCommand));
        responses[3]!.resolve(successfulBatchResponse(send.mock.calls[3]![0] as SendMessageBatchCommand));

        await expect(publishPromise).resolves.toEqual({ enqueued: 4, failed: 0 });
    });

    it('retries failed entries once and reports remaining failures', async () => {
        const responses: SendMessageBatchCommandOutput[] = [
            {
                $metadata: {},
                Successful: [{ Id: 'm0', MessageId: 'ok', MD5OfMessageBody: 'x' }],
                Failed: [
                    { Id: 'm1', SenderFault: false, Code: 'InternalError', Message: 'boom' },
                    { Id: 'm2', SenderFault: false, Code: 'InternalError', Message: 'boom' }
                ]
            },
            // second call is the retry of m1, m2 — only m1 recovers
            {
                $metadata: {},
                Successful: [{ Id: 'm1', MessageId: 'ok', MD5OfMessageBody: 'x' }],
                Failed: [{ Id: 'm2', SenderFault: false, Code: 'InternalError', Message: 'still broken' }]
            }
        ];
        const { sqs, send } = makeSqsMock((_n, call) => responses[call]!);
        const publisher = new DispatchQueuePublisher({ sqs, queueUrl: 'http://q' });
        const res = await publisher.publish([buildMessage(), buildMessage(), buildMessage()], 'account:1:env:2');
        expect(res).toEqual({ enqueued: 2, failed: 1 });
        expect(send.mock.calls).toHaveLength(2);
        expect(tracerMocks.span.setTag).toHaveBeenCalledWith('nango.enqueued', 2);
        expect(tracerMocks.span.setTag).toHaveBeenCalledWith('nango.failed', 1);
        expect(tracerMocks.span.setTag).toHaveBeenCalledWith('nango.retriedEntries', 2);
        expect(tracerMocks.span.setTag).toHaveBeenCalledWith('nango.retriedBatches', 1);
        expect(tracerMocks.span.setTag).toHaveBeenCalledWith('nango.partialFailure', true);
        expect(tracerMocks.span.setTag).toHaveBeenCalledWith('error', expect.any(Error));
        expect(tracerMocks.dogstatsd.increment).toHaveBeenCalledTimes(2);
        expect(tracerMocks.dogstatsd.increment).toHaveBeenCalledWith('nango.webhook.dispatch_queue.publish.success', 2, { provider: 'github' });
        expect(tracerMocks.dogstatsd.increment).toHaveBeenCalledWith('nango.webhook.dispatch_queue.publish.failure', 1, { provider: 'github' });
        expect(tracerMocks.span.finish).toHaveBeenCalledTimes(1);
    });

    it('treats an SDK throw as all-entries-failed and still retries', async () => {
        let call = 0;
        const { sqs, send } = makeSqsMock(() => {
            call++;
            if (call === 1) throw new Error('network');
            return { $metadata: {}, Successful: [{ Id: 'm0', MessageId: 'ok', MD5OfMessageBody: 'x' }], Failed: [] };
        });
        const publisher = new DispatchQueuePublisher({ sqs, queueUrl: 'http://q' });
        const res = await publisher.publish([buildMessage()], 'account:1:env:2');
        expect(res).toEqual({ enqueued: 1, failed: 0 });
        expect(send.mock.calls).toHaveLength(2);
        expect(tracerMocks.span.setTag).toHaveBeenCalledWith('nango.retriedEntries', 1);
        expect(tracerMocks.span.setTag).toHaveBeenCalledWith('nango.retriedBatches', 1);
        expect(tracerMocks.span.setTag.mock.calls.filter(([tag]) => tag === 'error')).toHaveLength(0);
        expect(tracerMocks.activeSpan.setTag).toHaveBeenCalledWith('sqs.send.error', expect.any(Error));
    });
});
