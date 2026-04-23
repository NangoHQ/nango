import { SendMessageBatchCommand } from '@aws-sdk/client-sqs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DispatchQueuePublisher } from './publisher.js';

import type { SQSClient, SendMessageBatchCommandOutput } from '@aws-sdk/client-sqs';
import type { WebhookDispatchMessage } from '@nangohq/types';

function buildMessage(overrides: Partial<WebhookDispatchMessage> = {}): WebhookDispatchMessage {
    return {
        version: 1,
        kind: 'webhook',
        taskName: 'webhook:abc123',
        createdAt: '2026-04-23T00:00:00.000Z',
        ingressRequestId: 'req-1',
        accountId: 1,
        environmentId: 2,
        integrationId: 3,
        provider: 'github',
        providerConfigKey: 'github-dev',
        parentSyncName: 'sync-1',
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
    });
});
