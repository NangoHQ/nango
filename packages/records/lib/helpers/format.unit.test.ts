import { describe, expect, it } from 'vitest';

import { formatRecords } from './format.js';

import type { UnencryptedRecordData } from '../types.js';

const base = {
    connectionId: 1,
    model: 'Test',
    syncId: '00000000-0000-0000-0000-000000000000',
    syncJobId: 1
};

describe('formatRecords', () => {
    it('should accept a numeric id of 0 (falsy but valid)', () => {
        const data = [{ id: 0, name: 'zero' }] as unknown as UnencryptedRecordData[];

        const res = formatRecords({ data, ...base });

        expect(res.isOk()).toBe(true);
        expect(res.unwrap()[0]?.external_id).toBe('0');
    });

    it('should not let one valid record fail the whole batch', () => {
        const data = [
            { id: 0, name: 'zero' },
            { id: '1', name: 'one' }
        ] as unknown as UnencryptedRecordData[];

        const res = formatRecords({ data, ...base });

        expect(res.isOk()).toBe(true);
        expect(res.unwrap()).toHaveLength(2);
    });

    it.each([{ id: undefined }, { id: null }, { id: '' }])('should reject a record with a missing id (%o)', (record) => {
        const data = [record] as unknown as UnencryptedRecordData[];

        const res = formatRecords({ data, ...base });

        expect(res.isErr()).toBe(true);
    });
});
