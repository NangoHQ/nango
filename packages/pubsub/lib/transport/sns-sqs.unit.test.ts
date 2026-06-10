import { PublishBatchCommand, PublishCommand } from '@aws-sdk/client-sns';
import { DeleteMessageCommand, ReceiveMessageCommand } from '@aws-sdk/client-sqs';
import { assert, beforeEach, describe, expect, it, vi } from 'vitest';

import { report } from '@nangohq/utils';

import { SnsSqs } from './sns-sqs.js';
import { serde } from '../utils/serde.js';

import type { SNSClient } from '@aws-sdk/client-sns';
import type { SQSClient } from '@aws-sdk/client-sqs';
import type { Event } from '@nangohq/types';

vi.mock('@nangohq/utils', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...(actual as Record<string, unknown>),
        getLogger: vi.fn(() => ({
            info: vi.fn(),
            warning: vi.fn(),
            error: vi.fn(),
            debug: vi.fn()
        })),
        report: vi.fn()
    };
});

const topicArn = 'arn:aws:sns:us-west-2:123456789012:nango-pubsub-usage';
const queueUrl = 'https://sqs.us-west-2.amazonaws.com/123456789012/billing-usage';

function abortError(): Error {
    const err = new Error('aborted');
    err.name = 'AbortError';
    return err;
}

function usageEvent() {
    return {
        idempotencyKey: 'idem-1',
        subject: 'usage',
        type: 'usage.actions',
        payload: {
            value: 10,
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
    } satisfies Event;
}

describe('SnsSqs transport', () => {
    const mockSnsSend = vi.fn();
    const mockSqsSend = vi.fn();
    const mockSnsDestroy = vi.fn();
    const mockSqsDestroy = vi.fn();

    const snsClient = { send: mockSnsSend, destroy: mockSnsDestroy } as unknown as SNSClient;
    const sqsClient = { send: mockSqsSend, destroy: mockSqsDestroy } as unknown as SQSClient;

    beforeEach(() => {
        vi.clearAllMocks();
    });

    function createTransport(): SnsSqs {
        return new SnsSqs({
            topicArns: { usage: topicArn },
            queueUrls: { 'billing:usage': queueUrl },
            snsClient,
            sqsClient
        });
    }

    it('connect succeeds and is idempotent', async () => {
        const t = createTransport();
        const first = await t.connect();
        assert(first.isOk());
        const second = await t.connect();
        assert(second.isOk());
    });

    it('publish fails when not connected', async () => {
        const t = createTransport();
        const res = await t.publish(usageEvent());
        assert(res.isErr());
        expect(res.error).toMatchObject({ message: expect.stringContaining('not connected') as string });
        expect(mockSnsSend).not.toHaveBeenCalled();
    });

    it('publish returns Err when no topic ARN is configured for the subject', async () => {
        const t = new SnsSqs({
            topicArns: { team: 'arn:aws:sns:us-west-2:123:team-only' },
            queueUrls: {},
            snsClient,
            sqsClient
        });
        await t.connect();
        const res = await t.publish(usageEvent());
        assert(res.isErr());
        expect(String(res.error)).toContain('No SNS topic ARN');
        expect(mockSnsSend).not.toHaveBeenCalled();
    });

    it('publish sends base64 v8 payload with subject message attribute', async () => {
        const t = createTransport();
        await t.connect();
        mockSnsSend.mockResolvedValueOnce(undefined);

        const eventRecord = usageEvent();
        const res = await t.publish(eventRecord);
        assert(res.isOk());

        expect(mockSnsSend).toHaveBeenCalledTimes(1);
        const [cmd] = mockSnsSend.mock.calls[0]!;
        expect(cmd).toBeInstanceOf(PublishCommand);
        const encoded = serde.serialize(eventRecord).unwrap();
        expect(cmd.input).toMatchObject({
            TopicArn: topicArn,
            Message: encoded.toString('base64'),
            MessageAttributes: {
                subject: { DataType: 'String', StringValue: 'usage' }
            }
        });
    });

    it('publish returns Err when SNS send throws', async () => {
        const t = createTransport();
        await t.connect();
        mockSnsSend.mockRejectedValueOnce(new Error('throttled'));

        const res = await t.publish(usageEvent());
        assert(res.isErr());
        expect(String(res.error)).toContain('Failed to publish message to SNS');
    });

    it('subscribe without connect reports and does not poll', () => {
        const t = createTransport();
        t.subscribe({
            consumerGroup: 'billing',
            subject: 'usage',
            callback: vi.fn()
        });
        expect(vi.mocked(report)).toHaveBeenCalled();
        expect(mockSqsSend).not.toHaveBeenCalled();
    });

    it('subscribe with connected transport but missing queue URL reports', async () => {
        const t = new SnsSqs({
            topicArns: { usage: topicArn },
            queueUrls: {},
            snsClient,
            sqsClient
        });
        await t.connect();
        t.subscribe({
            consumerGroup: 'billing',
            subject: 'usage',
            callback: vi.fn()
        });
        expect(vi.mocked(report)).toHaveBeenCalledWith(
            expect.objectContaining({ message: expect.stringContaining('no SQS queue URL') as string }),
            expect.objectContaining({ key: 'billing:usage' })
        );
        expect(mockSqsSend).not.toHaveBeenCalled();
    });

    it('delivers SNS-wrapped messages, invokes callback, and deletes', async () => {
        const t = createTransport();
        await t.connect();

        const eventRecord = usageEvent();
        const payloadB64 = serde.serialize(eventRecord).unwrap().toString('base64');
        const snsBody = JSON.stringify({ Type: 'Notification', Message: payloadB64 });

        const callback = vi.fn().mockResolvedValue(undefined);

        mockSqsSend
            .mockResolvedValueOnce({
                Messages: [{ Body: snsBody, ReceiptHandle: 'rh-1', MessageAttributes: { subject: { DataType: 'String', StringValue: 'usage' } } }]
            })
            .mockResolvedValueOnce(undefined)
            .mockImplementation((_cmd, opts?: { abortSignal?: AbortSignal }) => {
                return new Promise((_, reject) => {
                    opts?.abortSignal?.addEventListener('abort', () => reject(abortError()));
                });
            });

        t.subscribe({ consumerGroup: 'billing', subject: 'usage', callback });

        await vi.waitFor(() => expect(callback).toHaveBeenCalledTimes(1));
        expect(callback).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey: 'idem-1', subject: 'usage' }));

        const deleteCalls = mockSqsSend.mock.calls.filter((c) => c[0] instanceof DeleteMessageCommand);
        expect(deleteCalls).toHaveLength(1);
        expect(deleteCalls[0]![0].input).toMatchObject({ QueueUrl: queueUrl, ReceiptHandle: 'rh-1' });

        await t.disconnect();
    });

    it('accepts raw base64 body when not an SNS notification JSON', async () => {
        const t = createTransport();
        await t.connect();

        const eventRecord = usageEvent();
        const payloadB64 = serde.serialize(eventRecord).unwrap().toString('base64');
        const callback = vi.fn().mockResolvedValue(undefined);

        mockSqsSend
            .mockResolvedValueOnce({
                Messages: [{ Body: payloadB64, ReceiptHandle: 'rh-raw', MessageAttributes: { subject: { DataType: 'String', StringValue: 'usage' } } }]
            })
            .mockResolvedValueOnce(undefined)
            .mockImplementation((_cmd, opts?: { abortSignal?: AbortSignal }) => {
                return new Promise((_, reject) => {
                    opts?.abortSignal?.addEventListener('abort', () => reject(abortError()));
                });
            });

        t.subscribe({ consumerGroup: 'billing', subject: 'usage', callback });

        await vi.waitFor(() => expect(callback).toHaveBeenCalledTimes(1));
        await t.disconnect();
    });

    it('does not delete message when callback errors', async () => {
        const t = createTransport();
        await t.connect();
        const eventRecord = usageEvent();
        const payloadB64 = serde.serialize(eventRecord).unwrap().toString('base64');
        const callback = vi.fn().mockRejectedValue(new Error('boom'));

        mockSqsSend
            .mockResolvedValueOnce({
                Messages: [{ Body: payloadB64, ReceiptHandle: 'rh-err', MessageAttributes: { subject: { DataType: 'String', StringValue: 'usage' } } }]
            })
            .mockImplementation((_cmd, opts?: { abortSignal?: AbortSignal }) => {
                return new Promise((_, reject) => {
                    opts?.abortSignal?.addEventListener('abort', () => reject(abortError()));
                });
            });

        t.subscribe({ consumerGroup: 'billing', subject: 'usage', callback });
        await vi.waitFor(() => expect(callback).toHaveBeenCalledTimes(1));
        const deleteCalls = mockSqsSend.mock.calls.filter((c) => c[0] instanceof DeleteMessageCommand);
        expect(deleteCalls).toHaveLength(0);
        expect(vi.mocked(report)).toHaveBeenCalledWith(
            expect.objectContaining({ message: expect.stringContaining('subscriber callback error') as string }),
            expect.anything()
        );
        await t.disconnect();
    });

    it('does not delete message when subject attribute mismatches', async () => {
        const t = createTransport();
        await t.connect();
        const eventRecord = usageEvent();
        const payloadB64 = serde.serialize(eventRecord).unwrap().toString('base64');
        const callback = vi.fn();

        mockSqsSend
            .mockResolvedValueOnce({
                Messages: [{ Body: payloadB64, ReceiptHandle: 'rh-bad-subject', MessageAttributes: { subject: { DataType: 'String', StringValue: 'team' } } }]
            })
            .mockImplementation((_cmd, opts?: { abortSignal?: AbortSignal }) => {
                return new Promise((_, reject) => {
                    opts?.abortSignal?.addEventListener('abort', () => reject(abortError()));
                });
            });

        t.subscribe({ consumerGroup: 'billing', subject: 'usage', callback });
        await vi.waitFor(() =>
            expect(vi.mocked(report)).toHaveBeenCalledWith(
                expect.objectContaining({ message: expect.stringContaining('subject does not match') as string }),
                expect.objectContaining({ expectedSubject: 'usage', messageSubject: 'team' })
            )
        );
        expect(callback).not.toHaveBeenCalled();
        const deleteCalls = mockSqsSend.mock.calls.filter((c) => c[0] instanceof DeleteMessageCommand);
        expect(deleteCalls).toHaveLength(0);
        await t.disconnect();
    });

    describe('publishBatch', () => {
        it('returns Err when not connected', async () => {
            const t = createTransport();
            const res = await t.publishBatch({ subject: 'usage', events: [usageEvent()] });
            assert(res.isErr());
            expect(res.error.message).toContain('not connected');
            expect(mockSnsSend).not.toHaveBeenCalled();
        });

        it('returns Err when no topic ARN configured for subject', async () => {
            const t = new SnsSqs({ topicArns: {}, queueUrls: {}, snsClient, sqsClient });
            await t.connect();

            const res = await t.publishBatch({ subject: 'usage', events: [usageEvent()] });
            assert(res.isErr());
            expect(res.error.message).toContain('No SNS topic ARN');
            expect(mockSnsSend).not.toHaveBeenCalled();
        });

        it('sends PublishBatchCommand with idempotency key as entry Id', async () => {
            const t = createTransport();
            await t.connect();

            const event = usageEvent();
            mockSnsSend.mockResolvedValue({ Successful: [{ Id: event.idempotencyKey, MessageId: 'msg-1' }], Failed: [] });

            await t.publishBatch({ subject: 'usage', events: [event] });

            expect(mockSnsSend).toHaveBeenCalledTimes(1);
            const [cmd] = mockSnsSend.mock.calls[0]!;
            expect(cmd).toBeInstanceOf(PublishBatchCommand);
            const encoded = serde.serialize(event).unwrap().toString('base64');
            expect(cmd.input).toMatchObject({
                TopicArn: topicArn,
                PublishBatchRequestEntries: [
                    {
                        Id: event.idempotencyKey,
                        Message: encoded,
                        MessageAttributes: { subject: { DataType: 'String', StringValue: 'usage' } }
                    }
                ]
            });
        });

        it('maps successful response Ids back to idempotency keys', async () => {
            const t = createTransport();
            await t.connect();

            const event = usageEvent();
            mockSnsSend.mockResolvedValue({ Successful: [{ Id: event.idempotencyKey, MessageId: 'msg-1' }], Failed: [] });

            const res = await t.publishBatch({ subject: 'usage', events: [event] });
            assert(res.isOk());
            expect(res.value.successful).toEqual([event.idempotencyKey]);
            expect(res.value.failed).toHaveLength(0);
        });

        it('maps SNS Failed entry Ids back to idempotency keys with failure message', async () => {
            const t = createTransport();
            await t.connect();

            const events = [
                { ...usageEvent(), idempotencyKey: 'ok-key' },
                { ...usageEvent(), idempotencyKey: 'fail-key' }
            ];
            mockSnsSend.mockResolvedValue({
                Successful: [{ Id: 'ok-key', MessageId: 'msg-1' }],
                Failed: [{ Id: 'fail-key', Code: 'InvalidParameter', Message: 'bad message', SenderFault: true }]
            });

            const res = await t.publishBatch({ subject: 'usage', events });
            assert(res.isOk());
            expect(res.value.successful).toEqual(['ok-key']);
            expect(res.value.failed).toHaveLength(1);
            expect(res.value.failed[0]!.idempotencyKey).toBe('fail-key');
            expect(res.value.failed[0]!.message).toContain('bad message');
        });

        it('puts all batch entries in failed when PublishBatchCommand throws', async () => {
            const t = createTransport();
            await t.connect();
            mockSnsSend.mockRejectedValue(new Error('network error'));

            const events = [
                { ...usageEvent(), idempotencyKey: 'key-1' },
                { ...usageEvent(), idempotencyKey: 'key-2' }
            ];
            const res = await t.publishBatch({ subject: 'usage', events });
            assert(res.isOk());
            expect(res.value.successful).toHaveLength(0);
            expect(res.value.failed).toHaveLength(2);
            expect(res.value.failed.map((f) => f.idempotencyKey)).toEqual(['key-1', 'key-2']);
            expect(res.value.failed[0]!.message).toContain('network error');
        });

        it('chunks groups larger than 10 into multiple PublishBatchCommand calls', async () => {
            const t = createTransport();
            await t.connect();

            const events = Array.from({ length: 11 }, (_, i) => ({ ...usageEvent(), idempotencyKey: `idem-${i}` }));
            mockSnsSend
                .mockResolvedValueOnce({
                    Successful: events.slice(0, 10).map((e) => ({ Id: e.idempotencyKey, MessageId: `msg-${e.idempotencyKey}` })),
                    Failed: []
                })
                .mockResolvedValueOnce({
                    Successful: [{ Id: events[10]!.idempotencyKey, MessageId: `msg-${events[10]!.idempotencyKey}` }],
                    Failed: []
                });

            const res = await t.publishBatch({ subject: 'usage', events });
            assert(res.isOk());
            expect(res.value.successful).toHaveLength(11);
            expect(res.value.successful).toEqual(events.map((e) => e.idempotencyKey));
            expect(res.value.failed).toHaveLength(0);

            const batchCalls = mockSnsSend.mock.calls.filter((c) => c[0] instanceof PublishBatchCommand);
            expect(batchCalls).toHaveLength(2);
            expect(batchCalls[0]![0].input.PublishBatchRequestEntries).toHaveLength(10);
            expect(batchCalls[1]![0].input.PublishBatchRequestEntries).toHaveLength(1);
        });

        it('does not accept events with different subjects', async () => {
            const t = createTransport();
            await t.connect();
            const teamEv = { idempotencyKey: 'team-key', subject: 'team' as const, type: 'team.updated' as const, payload: { id: 1 }, createdAt: new Date() };
            // @ts-expect-error: publishBatch enforces all events share the subject parameter
            const res = await t.publishBatch({ subject: 'usage', events: [usageEvent(), teamEv] });
            assert(res.isErr());
            expect(res.error.message).toContain('All events must be of the provided subject: "usage"');
            expect(mockSnsSend).not.toHaveBeenCalled();
        });
    });

    it('disconnect aborts long polling', async () => {
        const t = createTransport();
        await t.connect();

        mockSqsSend.mockImplementation((_cmd, opts?: { abortSignal?: AbortSignal }) => {
            return new Promise((_, reject) => {
                opts?.abortSignal?.addEventListener('abort', () => reject(abortError()));
            });
        });

        t.subscribe({ consumerGroup: 'billing', subject: 'usage', callback: vi.fn() });
        await new Promise((r) => setTimeout(r, 10));
        await t.disconnect();

        expect(mockSqsSend).toHaveBeenCalled();
        const receiveCalls = mockSqsSend.mock.calls.filter((c) => c[0] instanceof ReceiveMessageCommand);
        expect(receiveCalls.length).toBeGreaterThanOrEqual(1);
        expect(receiveCalls[0]![0].input).toMatchObject({ QueueUrl: queueUrl });
    });

    it('starts multiple concurrent ReceiveMessage pollers when concurrency > 1', async () => {
        const t = createTransport();
        await t.connect();

        mockSqsSend.mockImplementation((_cmd, opts?: { abortSignal?: AbortSignal }) => {
            return new Promise((_, reject) => {
                opts?.abortSignal?.addEventListener('abort', () => reject(abortError()));
            });
        });

        t.subscribe({ consumerGroup: 'billing', subject: 'usage', callback: vi.fn(), concurrency: 3 });
        await vi.waitFor(() => {
            const receiveCalls = mockSqsSend.mock.calls.filter((c) => c[0] instanceof ReceiveMessageCommand);
            expect(receiveCalls.length).toBeGreaterThanOrEqual(3);
        });
        await t.disconnect();
    });
});
