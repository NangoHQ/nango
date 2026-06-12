import { describe, expect, it } from 'vitest';

import { formatRecords } from './format.js';

import type { UnencryptedRecordData } from '../types.js';

describe('formatRecords', () => {
    const base = {
        connectionId: 1,
        model: 'Test',
        syncId: '00000000-0000-0000-0000-000000000000',
        syncJobId: 1
    };

    it('should format every record in the batch', () => {
        const data = [{ id: '1' }, { id: '2' }, { id: '3' }];
        const res = formatRecords({ ...base, data });
        expect(res.isOk()).toBe(true);
        expect(res.unwrap().map((r) => r.external_id)).toEqual(['1', '2', '3']);
    });

    it('should skip null/undefined entries without dropping the rest of the batch', () => {
        // A single empty datum used to `break` the loop, silently dropping every
        // subsequent record. It must be skipped, not terminate formatting.
        const data = [{ id: '1' }, null, { id: '2' }, undefined, { id: '3' }] as unknown as UnencryptedRecordData[];
        const res = formatRecords({ ...base, data });
        expect(res.isOk()).toBe(true);
        expect(res.unwrap().map((r) => r.external_id)).toEqual(['1', '2', '3']);
    });

    it('should error when a non-empty record is missing an id', () => {
        const data = [{ id: '1' }, { name: 'no id' }] as unknown as UnencryptedRecordData[];
        const res = formatRecords({ ...base, data });
        expect(res.isErr()).toBe(true);
    });
});
