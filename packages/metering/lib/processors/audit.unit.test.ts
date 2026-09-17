import { DeleteMessageCommand, ReceiveMessageCommand } from '@aws-sdk/client-sqs';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AuditClient } from '@nangohq/audit';
import { serde } from '@nangohq/pubsub';
import { Err, metrics, Ok } from '@nangohq/utils';

import { AuditProcessor, unstorableReason } from './audit.js';

import type { SQSClient } from '@aws-sdk/client-sqs';
import type { AuditBatchWriter } from '@nangohq/audit';
import type { AuditRecordedEvent } from '@nangohq/types';

const QUEUE_URL = 'https://sqs.us-west-2.amazonaws.com/1/audit-test-audit-test';

const uuid = (seed: string) => `${seed.charCodeAt(0).toString(16).padStart(8, '0')}-0000-4000-8000-000000000000`;

function auditMessage(eventId: string, overrides: Record<string, unknown> = {}) {
    const event = {
        idempotencyKey: `key-${eventId}`,
        subject: 'audit',
        type: 'audit.recorded',
        payload: {
            event: JSON.stringify({
                id: uuid(eventId),
                occurredAt: '2026-07-30T10:00:00.000Z',
                resource: 'connection',
                action: 'deleted',
                accountId: 42,
                ...overrides
            })
        },
        createdAt: new Date('2026-07-30T10:00:00.000Z')
    } satisfies AuditRecordedEvent;

    return {
        MessageId: `sqs-${eventId}`,
        ReceiptHandle: `handle-${eventId}`,
        Body: serde.serialize(event).unwrap().toString('base64'),
        MessageAttributes: { subject: { DataType: 'String', StringValue: 'audit' } },
        Attributes: { ApproximateReceiveCount: '2' }
    };
}

// Serves one poll then nothing, so a loop makes exactly one pass over the messages under test.
function sqsServing(messages: unknown[]) {
    const deleted: string[] = [];
    let served = false;
    const send = vi.fn().mockImplementation((command: unknown) => {
        if (command instanceof ReceiveMessageCommand) {
            if (served) {
                // Stands in for long polling: without a macrotask the loop would spin on microtasks and
                // starve the test's timers.
                return new Promise((resolve) => setTimeout(() => resolve({}), 5));
            }
            served = true;
            return Promise.resolve({ Messages: messages });
        }
        if (command instanceof DeleteMessageCommand) {
            deleted.push(String(command.input.ReceiptHandle));
            return Promise.resolve({});
        }
        return Promise.resolve({});
    });
    return { sqs: { send, destroy: vi.fn() } as unknown as SQSClient, deleted, send };
}

async function run(messages: unknown[], store: AuditBatchWriter) {
    const { sqs, deleted, send } = sqsServing(messages);
    const proc = new AuditProcessor({
        queueUrl: QUEUE_URL,
        store,
        concurrency: 1,
        maxMessages: 10,
        waitTimeSeconds: 0,
        visibilityTimeoutSeconds: 30,
        sqs
    });
    proc.start();
    // The second receive only happens once the first batch has been handled.
    await vi.waitFor(() => expect(send.mock.calls.filter((c) => c[0] instanceof ReceiveMessageCommand).length).toBeGreaterThan(1));
    await proc.stop();
    return { deleted };
}

describe('AuditProcessor', () => {
    afterEach(() => vi.restoreAllMocks());

    it('collapses a received batch into one write and deletes every message', async () => {
        const recordMany = vi.fn().mockResolvedValue(Ok(undefined));
        const { deleted } = await run([auditMessage('a'), auditMessage('b'), auditMessage('c')], { recordMany });

        expect(recordMany).toHaveBeenCalledTimes(1);
        const [records, opts] = recordMany.mock.calls[0] as [{ event: string }[], { dedupToken: string }];
        expect(records.map((r) => (JSON.parse(r.event) as { id: string }).id)).toEqual([uuid('a'), uuid('b'), uuid('c')]);
        expect(opts.dedupToken).toMatch(/^[0-9a-f]{64}$/);
        expect(deleted.sort()).toEqual(['handle-a', 'handle-b', 'handle-c']);
    });

    it('deletes nothing when the write fails, so the batch redelivers and reaches the DLQ', async () => {
        const recordMany = vi.fn().mockResolvedValue(Err(new Error('clickhouse unavailable')));
        const { deleted } = await run([auditMessage('a'), auditMessage('b')], { recordMany });

        expect(recordMany).toHaveBeenCalledTimes(1);
        expect(deleted).toEqual([]);
    });

    it('excludes an undecodable message from the batch and leaves it for the DLQ', async () => {
        const recordMany = vi.fn().mockResolvedValue(Ok(undefined));
        const undecodable = { ...auditMessage('bad'), Body: 'not-base64-v8' };
        const { deleted } = await run([auditMessage('good'), undecodable], { recordMany });

        const [records] = recordMany.mock.calls[0] as [{ event: string }[]];
        expect(records).toHaveLength(1);
        expect((JSON.parse(records[0]!.event) as { id: string }).id).toBe(uuid('good'));
        expect(deleted).toEqual(['handle-good']);
    });

    it.each([
        ['a negative account id', { accountId: -1 }],
        ['an account id that is not an integer', { accountId: 1.5 }],
        ['an unparseable occurredAt', { occurredAt: 'not-a-date' }],
        ['an id that is not a uuid', { id: 'nope' }]
    ])('keeps the batch alive when one event carries %s, leaving it for the DLQ', async (_case, overrides) => {
        const recordMany = vi.fn().mockResolvedValue(Ok(undefined));
        const { deleted } = await run([auditMessage('good'), auditMessage('poison', overrides)], { recordMany });

        // The insert is atomic, so letting this row through would reject `good` too and redeliver it in a
        // differently composed batch, past the dedup token that would have suppressed a re-write.
        const [records] = recordMany.mock.calls[0] as [{ event: string }[]];
        expect(records).toHaveLength(1);
        expect((JSON.parse(records[0]!.event) as { id: string }).id).toBe(uuid('good'));
        expect(deleted).toEqual(['handle-good']);
    });

    it('counts a dropped event apart from a message that was never ours, so a monitor can page on one', async () => {
        const inc = vi.spyOn(metrics, 'increment').mockImplementation(() => undefined);
        const recordMany = vi.fn().mockResolvedValue(Ok(undefined));
        const wrongSubject = { ...auditMessage('x'), MessageAttributes: { subject: { DataType: 'String', StringValue: 'usage' } } };

        await run([auditMessage('poison', { accountId: -1 }), wrongSubject], { recordMany });

        expect(inc).toHaveBeenCalledWith(metrics.Types.AUDIT_CONSUMER_REJECTED, 1, { reason: 'invalid_account_id', kind: 'event' });
        expect(inc).toHaveBeenCalledWith(metrics.Types.AUDIT_CONSUMER_REJECTED, 1, { reason: 'subject_mismatch', kind: 'envelope' });
    });

    it('skips a message published under another subject', async () => {
        const recordMany = vi.fn().mockResolvedValue(Ok(undefined));
        const wrongSubject = { ...auditMessage('x'), MessageAttributes: { subject: { DataType: 'String', StringValue: 'usage' } } };
        const { deleted } = await run([wrongSubject], { recordMany });

        expect(recordMany).not.toHaveBeenCalled();
        expect(deleted).toEqual([]);
    });

    it('gives a batch the same dedup token every time it is delivered, so a re-sent insert is discarded', async () => {
        const first = vi.fn().mockResolvedValue(Ok(undefined));
        await run([auditMessage('a'), auditMessage('b')], { recordMany: first });

        // Same messages, redelivered in a different order — SQS makes no ordering promise.
        const second = vi.fn().mockResolvedValue(Ok(undefined));
        await run([auditMessage('b'), auditMessage('a')], { recordMany: second });

        const tokenOf = (m: ReturnType<typeof vi.fn>) => (m.mock.calls[0] as [unknown, { dedupToken: string }])[1].dedupToken;
        expect(tokenOf(first)).toBe(tokenOf(second));
    });

    it('rejects an envelope whose payload carries no event blob', async () => {
        const recordMany = vi.fn().mockResolvedValue(Ok(undefined));
        const notAnEnvelope = {
            ...auditMessage('x'),
            Body: serde
                .serialize({ idempotencyKey: 'k', subject: 'audit', type: 'audit.recorded', payload: {}, createdAt: new Date() })
                .unwrap()
                .toString('base64')
        };
        const { deleted } = await run([notAnEnvelope], { recordMany });

        expect(recordMany).not.toHaveBeenCalled();
        expect(deleted).toEqual([]);
    });
});

describe('unstorableReason contract with the emitter', () => {
    // The guard is a hand-written mirror of the table, and its fixtures are hand-written too, so nothing
    // otherwise stops a producer-side change from making every event unstorable - which would show up only
    // as events piling into the DLQ. This runs what the emitter actually serialises through the guard.
    it('accepts an event the emitter produced', async () => {
        let captured = '';
        const writer = {
            record: (record: { event: string }) => {
                captured = record.event;
                return Promise.resolve(Ok(undefined));
            }
        };

        (
            await new AuditClient(writer, {} as never).record({
                occurredAt: new Date().toISOString(),
                accountId: 42,
                scope: 'environment',
                environment: { id: 'e0000000-0000-4000-8000-000000000001', display: 'dev' },
                actor: { type: 'user', id: '5', display: 'a@b.co' },
                resource: 'connection',
                action: 'deleted',
                targets: [{ type: 'connection', id: '10' }],
                context: { ip: '1.2.3.4' },
                outcome: 'success'
            })
        ).unwrap();

        // Covers the three fields the guard judges: the id `record()` stamps, the caller's ISO timestamp,
        // and a numeric account id.
        expect(captured).not.toBe('');
        expect(unstorableReason(captured)).toBeNull();
    });
});

describe('unstorableReason', () => {
    const event = (overrides: Record<string, unknown> = {}) =>
        JSON.stringify({ id: uuid('a'), occurredAt: '2026-07-30T10:00:00.000Z', accountId: 42, ...overrides });

    it('accepts account 0, the account every no-auth request runs as', () => {
        expect(unstorableReason(event({ accountId: 0 }))).toBeNull();
    });

    // Reason before blob, so the printf title reads as "reports X as invalid_account_id".
    it.each([
        ['a well-formed event', null, event()],
        ['a bare JSON null, which parses but cannot be destructured', 'invalid_json', 'null'],
        ['a JSON array', 'invalid_json', '[]'],
        ['unparseable JSON', 'invalid_json', '{'],
        ['a negative account id', 'invalid_account_id', event({ accountId: -1 })],
        ['a fractional account id', 'invalid_account_id', event({ accountId: 1.5 })],
        ['an account id sent as a string', 'invalid_account_id', event({ accountId: '42' })],
        ['a missing id', 'invalid_id', event({ id: undefined })],
        // `z.uuid()` checks the RFC version nibble, so this is stricter than `toUUID`, which would take it.
        // Unreachable from `randomUUID`, and rejecting one message beats letting it fail a batch.
        ['a uuid with no version', 'invalid_id', event({ id: '11111111-1111-0111-8111-111111111111' })],
        ['an unparseable occurredAt', 'invalid_occurred_at', event({ occurredAt: 'nope' })],
        // Rolls over to March 2 in JS but ClickHouse refuses it, which would fail the whole insert block.
        ['a day past the end of the month', 'invalid_occurred_at', event({ occurredAt: '2026-02-30T10:00:00.000Z' })],
        ['a leap day in a non-leap year', 'invalid_occurred_at', event({ occurredAt: '2026-02-29T10:00:00.000Z' })],
        ['a leap day in a leap year', null, event({ occurredAt: '2028-02-29T10:00:00.000Z' })],
        ['a timestamp without milliseconds, which ClickHouse accepts', null, event({ occurredAt: '2026-01-15T10:00:00Z' })],
        // An offset that moves the timestamp across midnight: the calendar day is still real, so it stays.
        ['an offset timestamp whose UTC day differs', null, event({ occurredAt: '2026-01-01T00:30:00+01:00' })],
        ['a month past 12', 'invalid_occurred_at', event({ occurredAt: '2026-13-01T10:00:00.000Z' })]
    ])('reports %s as %s', (_case, expected, blob) => {
        expect(unstorableReason(blob)).toBe(expected);
    });
});
