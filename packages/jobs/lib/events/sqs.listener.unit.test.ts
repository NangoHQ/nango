// Unit tests for SqsEventListener

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockSend = vi.fn();
const mockDestroy = vi.fn();

vi.mock('@aws-sdk/client-sqs', () => ({
    SQSClient: vi.fn().mockImplementation(() => ({
        send: mockSend,
        destroy: mockDestroy
    })),
    GetQueueUrlCommand: vi.fn().mockImplementation((input: Record<string, unknown>) => ({ input })),
    ReceiveMessageCommand: vi.fn().mockImplementation((input: Record<string, unknown>) => ({ input })),
    DeleteMessageCommand: vi.fn().mockImplementation((input: Record<string, unknown>) => ({ input }))
}));

vi.mock('@nangohq/utils', () => ({
    getLogger: vi.fn(() => ({
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn()
    })),
    report: vi.fn()
}));

import { SqsEventListener } from './sqs.listener.js';

const queueUrl = 'https://sqs.us-west-2.amazonaws.com/123456789/test-queue';

function abortError(): Error {
    const err = new Error('aborted');
    err.name = 'AbortError';
    return err;
}

describe('SqsEventListener', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('extracts queue name from ARN and requests queue URL with it', async () => {
        mockSend.mockResolvedValueOnce({ QueueUrl: queueUrl }).mockRejectedValueOnce(abortError());

        const listener = new SqsEventListener();
        await listener.listen('arn:aws:sqs:us-west-2:123456789:my-queue-name');

        expect(mockSend).toHaveBeenNthCalledWith(1, expect.anything());
        const firstCall = mockSend.mock.calls[0]!;
        const cmd = firstCall[0];
        expect(cmd.input).toMatchObject({ QueueName: 'my-queue-name' });
    });

    it('exits listen loop when ReceiveMessage throws AbortError', async () => {
        mockSend.mockResolvedValueOnce({ QueueUrl: queueUrl }).mockRejectedValueOnce(abortError());

        const listener = new SqsEventListener();
        await listener.listen('test-queue');
        expect(mockSend).toHaveBeenCalledTimes(2);
    });

    it('invokes onMessage for each received message and deletes after processing', async () => {
        const onMessage = vi.fn().mockResolvedValue(undefined);
        mockSend
            .mockResolvedValueOnce({ QueueUrl: queueUrl })
            .mockResolvedValueOnce({
                Messages: [
                    { Body: '{"foo":1}', ReceiptHandle: 'handle-1' },
                    { Body: '{"bar":2}', ReceiptHandle: 'handle-2' }
                ]
            })
            .mockResolvedValueOnce(undefined)
            .mockResolvedValueOnce(undefined)
            .mockRejectedValueOnce(abortError());

        const listener = new SqsEventListener();
        await listener.listen('test-queue', onMessage);

        expect(onMessage).toHaveBeenCalledTimes(2);
        expect(onMessage).toHaveBeenNthCalledWith(1, { body: '{"foo":1}' });
        expect(onMessage).toHaveBeenNthCalledWith(2, { body: '{"bar":2}' });
        expect(mockSend).toHaveBeenCalledTimes(5);
        const deleteCalls = mockSend.mock.calls.filter((call) => call[0].input?.ReceiptHandle != null);
        expect(deleteCalls).toHaveLength(2);
        expect(deleteCalls[0]![0].input).toMatchObject({ ReceiptHandle: 'handle-1', QueueUrl: queueUrl });
        expect(deleteCalls[1]![0].input).toMatchObject({ ReceiptHandle: 'handle-2', QueueUrl: queueUrl });
    });

    it('passes abortSignal to ReceiveMessage and DeleteMessage send calls', async () => {
        mockSend
            .mockResolvedValueOnce({ QueueUrl: queueUrl })
            .mockImplementation((cmd: { input?: { ReceiptHandle?: string } }, options?: { abortSignal?: AbortSignal }) => {
                if (cmd.input?.ReceiptHandle != null) {
                    return Promise.resolve(undefined);
                }
                return new Promise((_, reject) => {
                    options?.abortSignal?.addEventListener('abort', () => reject(abortError()));
                });
            });

        const listener = new SqsEventListener();
        const listenPromise = listener.listen('test-queue');
        await new Promise((r) => setTimeout(r, 10));
        await listener.stop();
        await listenPromise;

        expect(mockDestroy).toHaveBeenCalledTimes(1);
    });

    it('stop() aborts and destroys client', async () => {
        mockSend.mockResolvedValueOnce({ QueueUrl: queueUrl }).mockRejectedValueOnce(abortError());

        const listener = new SqsEventListener();
        await listener.listen('test-queue');
        await listener.stop();

        expect(mockDestroy).toHaveBeenCalledTimes(1);
    });

    it('skip message when Body or ReceiptHandle is missing', async () => {
        const onMessage = vi.fn().mockResolvedValue(undefined);
        mockSend
            .mockResolvedValueOnce({ QueueUrl: queueUrl })
            .mockResolvedValueOnce({
                Messages: [{ Body: 'valid', ReceiptHandle: 'h1' }, { Body: '', ReceiptHandle: 'h2' }, { ReceiptHandle: 'h3' }, { Body: 'only-body' }]
            })
            .mockResolvedValueOnce(undefined)
            .mockRejectedValueOnce(abortError());

        const listener = new SqsEventListener();
        await listener.listen('test-queue', onMessage);

        expect(onMessage).toHaveBeenCalledTimes(1);
        expect(onMessage).toHaveBeenCalledWith({ body: 'valid' });
    });
});
