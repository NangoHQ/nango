import { describe, expect, it, vi } from 'vitest';

import { Err, Ok } from '@nangohq/utils';

import { logger } from '../utils.js';
import { AuditProcessor } from './audit.js';

import type { AuditWriter } from '@nangohq/audit';
import type { SubscribeProps, Transport } from '@nangohq/pubsub';
import type { AuditRecordedEvent } from '@nangohq/types';

const record = { event: '{"id":"11111111-1111-1111-1111-111111111111","accountId":42}' };

const message = {
    idempotencyKey: 'key-1',
    subject: 'audit',
    type: 'audit.recorded',
    payload: record,
    createdAt: new Date('2026-07-16T10:00:00.000Z')
} satisfies AuditRecordedEvent;

function start(store: AuditWriter) {
    let props: SubscribeProps<'audit'> | undefined;
    const transport = {
        subscribe: (p: SubscribeProps<'audit'>) => {
            props = p;
        }
    } as unknown as Transport;

    new AuditProcessor({ transport, store }).start();

    return props!;
}

describe('AuditProcessor', () => {
    it('subscribes to the audit subject under the audit consumer group', () => {
        const props = start({ record: () => Promise.resolve(Ok(undefined)) });
        expect(props.subject).toBe('audit');
        expect(props.consumerGroup).toBe('audit');
    });

    it('stores the payload as received', async () => {
        const write = vi.fn().mockResolvedValue(Ok(undefined));
        const props = start({ record: write });

        await props.callback(message);

        expect(write).toHaveBeenCalledWith(record);
    });

    it('logs and acknowledges when the write fails, so one bad event cannot block the queue', async () => {
        const error = vi.spyOn(logger, 'error');
        const props = start({ record: () => Promise.resolve(Err(new Error('clickhouse unavailable'))) });

        await expect(props.callback(message)).resolves.toBeUndefined();
        expect(error).toHaveBeenCalledWith(expect.stringContaining('clickhouse unavailable'));
    });
});
