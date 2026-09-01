import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { changeVisibility, deferSeconds, keepVisible } from './visibility.js';

import type { ChangeMessageVisibilityBatchCommand, SQSClient } from '@aws-sdk/client-sqs';
import type { Mock } from 'vitest';

function deferred<T>() {
    let resolve!: (value: T | PromiseLike<T>) => void;
    const promise = new Promise<T>((res) => {
        resolve = res;
    });
    return { promise, resolve };
}

function makeSqs(): { sqs: SQSClient; send: Mock<(command: unknown) => Promise<unknown>> } {
    const send = vi.fn<(command: unknown) => Promise<unknown>>().mockResolvedValue({});
    return { sqs: { send } as unknown as SQSClient, send };
}

function entriesOf(send: Mock<(command: unknown) => Promise<unknown>>) {
    return send.mock.calls.map((c) => (c[0] as ChangeMessageVisibilityBatchCommand).input.Entries);
}

describe('deferSeconds', () => {
    it('rounds up to whole seconds', () => {
        expect(deferSeconds(30_000, 0)).toBe(30);
        expect(deferSeconds(1_001, 0)).toBe(2);
    });

    it('never returns less than one second', () => {
        expect(deferSeconds(0, 0)).toBe(1);
        expect(deferSeconds(10, 0)).toBe(1);
    });

    it('only ever jitters upward, so a deferral never lands early', () => {
        for (let i = 0; i < 100; i++) {
            const seconds = deferSeconds(30_000, 0.2);
            expect(seconds).toBeGreaterThanOrEqual(30);
            expect(seconds).toBeLessThanOrEqual(36);
        }
    });

    it('clamps to the SQS maximum', () => {
        expect(deferSeconds(99_999_999, 0)).toBe(43_200);
    });
});

describe('changeVisibility', () => {
    it('sends one entry per receipt handle', async () => {
        const { sqs, send } = makeSqs();
        await changeVisibility({ sqs, queueUrl: 'http://queue', receiptHandles: ['a', 'b'], visibilityTimeoutSeconds: 30 });

        expect(entriesOf(send)).toEqual([
            [
                { Id: '0', ReceiptHandle: 'a', VisibilityTimeout: 30 },
                { Id: '1', ReceiptHandle: 'b', VisibilityTimeout: 30 }
            ]
        ]);
    });

    it('splits into chunks of ten, which is the SQS batch limit', async () => {
        const { sqs, send } = makeSqs();
        const receiptHandles = Array.from({ length: 12 }, (_, i) => `rh-${i}`);
        await changeVisibility({ sqs, queueUrl: 'http://queue', receiptHandles, visibilityTimeoutSeconds: 5 });

        const batches = entriesOf(send);
        expect(batches).toHaveLength(2);
        expect(batches[0]).toHaveLength(10);
        expect(batches[1]).toEqual([
            { Id: '10', ReceiptHandle: 'rh-10', VisibilityTimeout: 5 },
            { Id: '11', ReceiptHandle: 'rh-11', VisibilityTimeout: 5 }
        ]);
    });

    it('does nothing without receipt handles', async () => {
        const { sqs, send } = makeSqs();
        await changeVisibility({ sqs, queueUrl: 'http://queue', receiptHandles: [], visibilityTimeoutSeconds: 30 });

        expect(send).not.toHaveBeenCalled();
    });

    it('rejects per-entry failures returned by SQS', async () => {
        const { sqs, send } = makeSqs();
        send.mockResolvedValueOnce({ Failed: [{ Id: '0', Code: 'ReceiptHandleIsInvalid', Message: 'invalid handle' }] });

        await expect(changeVisibility({ sqs, queueUrl: 'http://queue', receiptHandles: ['a'], visibilityTimeoutSeconds: 30 })).rejects.toThrow(
            'webhook dispatch visibility batch partially failed'
        );
    });
});

describe('keepVisible', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    const props = (sqs: SQSClient) => ({
        sqs,
        queueUrl: 'http://queue',
        receiptHandles: ['a'],
        visibilityTimeoutSeconds: 30,
        maxExtensionMs: 300_000
    });

    it('extends on a third of the visibility window', async () => {
        const { sqs, send } = makeSqs();
        const stop = keepVisible(props(sqs));

        await vi.advanceTimersByTimeAsync(9_999);
        expect(send).not.toHaveBeenCalled();

        await vi.advanceTimersByTimeAsync(1);
        expect(send).toHaveBeenCalledTimes(1);

        await vi.advanceTimersByTimeAsync(10_000);
        expect(send).toHaveBeenCalledTimes(2);
        await stop();
    });

    it('stops extending once stopped', async () => {
        const { sqs, send } = makeSqs();
        const stop = keepVisible(props(sqs));

        await vi.advanceTimersByTimeAsync(10_000);
        await stop();
        await vi.advanceTimersByTimeAsync(60_000);

        expect(send).toHaveBeenCalledTimes(1);
    });

    it('gives up after the maximum extension so a hung call cannot hold a message forever', async () => {
        const { sqs, send } = makeSqs();
        const stop = keepVisible({ ...props(sqs), maxExtensionMs: 25_000 });

        await vi.advanceTimersByTimeAsync(20_000);
        expect(send).toHaveBeenCalledTimes(2);

        await vi.advanceTimersByTimeAsync(60_000);
        expect(send).toHaveBeenCalledTimes(2);
        expect(vi.getTimerCount()).toBe(0);
        await stop();
    });

    it('is a no-op when there is nothing to keep visible', async () => {
        const { sqs, send } = makeSqs();
        keepVisible({ ...props(sqs), receiptHandles: [] });

        await vi.advanceTimersByTimeAsync(60_000);
        expect(send).not.toHaveBeenCalled();
    });

    it('extends before a one-second visibility timeout expires', async () => {
        const { sqs, send } = makeSqs();
        const stop = keepVisible({ ...props(sqs), visibilityTimeoutSeconds: 1 });

        await vi.advanceTimersByTimeAsync(332);
        expect(send).not.toHaveBeenCalled();

        await vi.advanceTimersByTimeAsync(1);
        expect(send).toHaveBeenCalledTimes(1);
        await stop();
    });

    it('waits for an in-flight extension when stopped', async () => {
        const { sqs, send } = makeSqs();
        const extension = deferred<undefined>();
        send.mockReturnValueOnce(extension.promise);
        const stop = keepVisible(props(sqs));

        await vi.advanceTimersByTimeAsync(10_000);
        let stopped = false;
        const stopPromise = stop().then(() => {
            stopped = true;
        });
        await Promise.resolve();
        expect(stopped).toBe(false);

        extension.resolve(undefined);
        await stopPromise;
        expect(stopped).toBe(true);
    });
});
