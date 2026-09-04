import { describe, expect, it, vi } from 'vitest';

import { changeVisibility, deferSeconds } from './visibility.js';

import type { ChangeMessageVisibilityBatchCommand, SQSClient } from '@aws-sdk/client-sqs';
import type { Mock } from 'vitest';

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
