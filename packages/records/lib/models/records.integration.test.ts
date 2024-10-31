import { expect, describe, it, beforeAll, afterEach } from 'vitest';
import dayjs from 'dayjs';
import * as uuid from 'uuid';
import { migrate } from '../db/migrate.js';
import { RECORDS_TABLE } from '../constants.js';
import { db } from '../db/client.js';
import * as Records from '../models/records.js';
import { formatRecords } from '../helpers/format.js';
import type { UnencryptedRecordData, UpsertSummary } from '../types.js';

describe('Records service', () => {
    beforeAll(async () => {
        await migrate();
    });

    afterEach(async () => {
        await db(RECORDS_TABLE).truncate();
    });

    it('Should write records', async () => {
        const connectionId = 1;
        const environmentId = 2;
        const model = 'my-model';
        const syncId = '00000000-0000-0000-0000-000000000000';
        const records = [
            { id: '1', name: 'John Doe' },
            { id: '1', name: 'John Doe' },
            { id: '2', name: 'Jane Doe' },
            { id: '3', name: 'Max Doe' },
            { id: '4', name: 'Mike Doe' }
        ];
        const res = await upsertRecords(records, connectionId, environmentId, model, syncId, 1);
        expect(res).toStrictEqual({ addedKeys: ['1', '2', '3', '4'], updatedKeys: [], deletedKeys: [], nonUniqueKeys: ['1'] });

        const newRecords = [{ id: '2', name: 'Jane Moe' }];
        const updateRes = await updateRecords(newRecords, connectionId, model, syncId, 2);
        expect(updateRes).toStrictEqual({ addedKeys: [], updatedKeys: ['2'], deletedKeys: [], nonUniqueKeys: [] });
    });

    it('Should be able to encrypt and insert 2000 records under 2 seconds', async () => {
        const connectionId = 1;
        const environmentId = 2;
        const model = 'my-model';
        const syncId = '00000000-0000-0000-0000-000000000000';
        const records = Array.from({ length: 2000 }, (_, i) => ({
            id: i.toString(),
            name: `record ${i}`,
            email: `test${i}@nango.dev`,
            phone: `123-456-7890`,
            address: `1234 random st. Apt ${i}`,
            city: `RandomCity${i}`,
            country: `Country${i}`,
            zip: `12345`
        }));
        const start = Date.now();
        const res = await upsertRecords(records, connectionId, environmentId, model, syncId, 1);
        const end = Date.now();

        expect(res.addedKeys.length).toStrictEqual(2000);
        expect(res.updatedKeys.length).toStrictEqual(0);
        expect(res.deletedKeys?.length).toStrictEqual(0);
        expect(res.nonUniqueKeys.length).toStrictEqual(0);
        expect(end - start).toBeLessThan(2000);
    });

    it('Should delete records', async () => {
        const connectionId = 1;
        const environmentId = 2;
        const model = 'my-model';
        const syncId = '00000000-0000-0000-0000-000000000000';
        const records = [
            { id: '1', name: 'John Doe' },
            { id: '2', name: 'Jane Doe' },
            { id: '3', name: 'Max Doe' }
        ];
        await upsertRecords(records, connectionId, environmentId, model, syncId, 1);

        const toDelete = [
            { id: '1', name: 'John Doe' },
            { id: '2', name: 'Jane Doe' }
        ];
        const res1 = await upsertRecords(toDelete, connectionId, environmentId, model, syncId, 1, true);
        expect(res1).toStrictEqual({ addedKeys: [], updatedKeys: [], deletedKeys: ['1', '2'], nonUniqueKeys: [] });

        // Try to delete the same records again
        // Should not have any effect
        const res2 = await upsertRecords(toDelete, connectionId, environmentId, model, syncId, 1, true);
        expect(res2).toStrictEqual({ addedKeys: [], updatedKeys: [], deletedKeys: [], nonUniqueKeys: [] });
    });

    it('Should retrieve records', async () => {
        const n = 10;
        const { connectionId, model } = await upsertNRecords(n);
        const response = await Records.getRecords({ connectionId, model });
        if (response.isErr()) {
            throw new Error('Response is undefined');
        }
        const { records, next_cursor } = response.value;
        expect(records.length).toBe(n);
        expect(records[0]?.['_nango_metadata']).toMatchObject({
            first_seen_at: expect.toBeIsoDateTimezone(),
            last_modified_at: expect.toBeIsoDateTimezone(),
            last_action: 'ADDED',
            deleted_at: null,
            cursor: expect.stringMatching(/^[A-Za-z0-9+/]+={0,2}$/) // base64 encoded string
        });
        expect(next_cursor).toBe(null); // no next page
    });
    it('Should paginate the records to retrieve all records', async () => {
        const numOfRecords = 3000;
        const limit = 100;
        const { connectionId, model } = await upsertNRecords(numOfRecords);

        let cursor: string | undefined | null = null;
        const allFetchedRecords = [];
        do {
            const response = await Records.getRecords({
                connectionId,
                model,
                limit,
                ...(cursor && { cursor })
            });

            if (response.isErr() || !response.value) {
                throw new Error('Fail to fetch records');
            }

            const { records, next_cursor } = response.value;

            allFetchedRecords.push(...records);

            cursor = next_cursor;

            expect(records).not.toBe(undefined);
            expect(records?.length).toBeLessThanOrEqual(limit);
        } while (cursor);

        for (let i = 1; i < allFetchedRecords.length; i++) {
            const currentRecordDate = dayjs(allFetchedRecords[i]?._nango_metadata.first_seen_at);
            const previousRecordDate = dayjs(allFetchedRecords[i - 1]?._nango_metadata.first_seen_at);

            expect(currentRecordDate.isAfter(previousRecordDate) || currentRecordDate.isSame(previousRecordDate)).toBe(true);
        }
        expect(allFetchedRecords.length).toBe(numOfRecords);
    });

    it('Should be able to retrieve 20K records in under 5s with a cursor', async () => {
        const numOfRecords = 20000;
        const limit = 1000;
        const { connectionId, model } = await upsertNRecords(numOfRecords);

        let cursor: string | undefined | null = null;
        let allRecordsLength = 0;

        const startTime = Date.now();
        do {
            const response = await Records.getRecords({
                connectionId,
                model,
                limit,
                ...(cursor && { cursor })
            });

            if (response.isErr() || !response.value) {
                throw new Error('Error fetching records');
            }

            const { records, next_cursor } = response.value;

            allRecordsLength += records.length;

            cursor = next_cursor;

            expect(records).not.toBe(undefined);
            expect(records?.length).toBeLessThanOrEqual(limit);
        } while (cursor);

        const endTime = Date.now();

        const runTime = endTime - startTime;
        expect(runTime).toBeLessThan(5000);

        expect(allRecordsLength).toBe(numOfRecords);
    });
});

async function upsertNRecords(n: number): Promise<{ connectionId: number; model: string; syncId: string; syncJobId: number; result: UpsertSummary }> {
    const records = Array.from({ length: n }, (_, i) => ({ id: `${i}`, name: `record ${i}` }));
    const connectionId = Math.floor(Math.random() * 1000);
    const environementId = Math.floor(Math.random() * 1000);
    const model = 'model-' + Math.random().toString(36).substring(0, 4);
    const syncId = uuid.v4();
    const syncJobId = Math.floor(Math.random() * 1000);
    const result = await upsertRecords(records, connectionId, environementId, model, '00000000-0000-0000-0000-000000000000', 1);
    return {
        connectionId,
        model,
        syncId,
        syncJobId,
        result
    };
}

async function upsertRecords(
    records: UnencryptedRecordData[],
    connectionId: number,
    environmentId: number,
    model: string,
    syncId: string,
    syncJobId: number,
    softDelete = false
): Promise<UpsertSummary> {
    const formatRes = formatRecords({ data: records, connectionId, model, syncId, syncJobId, softDelete });
    if (formatRes.isErr()) {
        throw new Error(`Failed to format records: ${formatRes.error.message}`);
    }
    const upsertRes = await Records.upsert({ records: formatRes.value, connectionId, environmentId, model, softDelete });
    if (upsertRes.isErr()) {
        throw new Error(`Failed to update records: ${upsertRes.error.message}`);
    }
    return upsertRes.value;
}

async function updateRecords(records: UnencryptedRecordData[], connectionId: number, model: string, syncId: string, syncJobId: number) {
    const formatRes = formatRecords({ data: records, connectionId, model, syncId, syncJobId });
    if (formatRes.isErr()) {
        throw new Error(`Failed to format records: ${formatRes.error.message}`);
    }
    const updateRes = await Records.update({ records: formatRes.value, connectionId, model });
    if (updateRes.isErr()) {
        throw new Error(`Failed to update records: ${updateRes.error.message}`);
    }
    return updateRes.value;
}
