import { describe, expect, it, vi } from 'vitest';

import { Err, Ok } from '@nangohq/utils';

import { PubSubAuditWriter } from './pubsub.js';

import type { Publisher } from '@nangohq/pubsub';
import type { SerializedAuditEvent } from '@nangohq/types';

const record: SerializedAuditEvent = { event: '{"id":"11111111-1111-1111-1111-111111111111","accountId":42}' };

describe('PubSubAuditWriter.record', () => {
    it('publishes the record as an audit.recorded message', async () => {
        const publish = vi.fn().mockResolvedValue(Ok(undefined));
        const writer = new PubSubAuditWriter({ publish } as unknown as Publisher);

        const result = await writer.record(record);

        expect(result.isOk()).toBe(true);
        expect(publish).toHaveBeenCalledWith({ subject: 'audit', type: 'audit.recorded', payload: record });
    });

    it('propagates a publish failure', async () => {
        const publish = vi.fn().mockResolvedValue(Err(new Error('no broker')));
        const writer = new PubSubAuditWriter({ publish } as unknown as Publisher);

        expect((await writer.record(record)).isErr()).toBe(true);
    });
});
