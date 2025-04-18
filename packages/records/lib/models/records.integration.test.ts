import dayjs from 'dayjs';
import * as uuid from 'uuid';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { RECORDS_TABLE } from '../constants.js';
import { db } from '../db/client.js';
import { migrate } from '../db/migrate.js';
import { formatRecords } from '../helpers/format.js';
import * as Records from '../models/records.js';

import type { FormattedRecord, UnencryptedRecordData, UpsertSummary } from '../types.js';
import type { MergingStrategy } from '@nangohq/types';

describe('Records service', () => {
    beforeAll(async () => {
        await migrate();
    });

    afterAll(async () => {
        await db(RECORDS_TABLE).truncate();
    });

    describe('Should fetch cursor', () => {
        const model = 'my-model';
        const syncId = uuid.v4();
        const records = [
            { id: '1', name: 'John Doe' },
            { id: '2', name: 'Jane Doe' },
            { id: '3', name: 'Max Doe' },
            { id: '4', name: 'Mike Doe' }
        ];
        it('when offset = first', async () => {
            const connectionId = rnd.number();
            const environmentId = rnd.number();
            await upsertRecords({ records, connectionId, environmentId, model, syncId });
            const fetched = (await Records.getRecords({ connectionId, model })).unwrap();
            const firstRecord = fetched.records[0];
            const expectedFirstCursor = firstRecord?.['_nango_metadata'].cursor;
            expect(expectedFirstCursor).not.toBe(undefined);

            const firstCursor = (await Records.getCursor({ connectionId, model, offset: 'first' })).unwrap();
            expect(firstCursor).not.toBe(undefined);
            expect(firstCursor).toBe(expectedFirstCursor);
        });

        it('when offset = last', async () => {
            const connectionId = rnd.number();
            const environmentId = rnd.number();
            await upsertRecords({ records, connectionId, environmentId, model, syncId });
            const fetched = (await Records.getRecords({ connectionId, model })).unwrap();
            const lastRecord = fetched.records[fetched.records.length - 1];
            const expectedLastCursor = lastRecord?.['_nango_metadata'].cursor;
            expect(expectedLastCursor).not.toBe(undefined);

            const lastCursor = (await Records.getCursor({ connectionId, model, offset: 'last' })).unwrap();
            expect(lastCursor).not.toBe(undefined);
            expect(lastCursor).toBe(expectedLastCursor);
        });
    });

    it('Should write records', async () => {
        const connectionId = rnd.number();
        const environmentId = rnd.number();
        const model = rnd.string();
        const syncId = uuid.v4();
        const records = [
            { id: '1', name: 'John Doe' },
            { id: '1', name: 'John Doe' },
            { id: '2', name: 'Jane Doe' },
            { id: '3', name: 'Max Doe' },
            { id: '4', name: 'Mike Doe' }
        ];
        const inserted = await upsertRecords({ records, connectionId, environmentId, model, syncId, syncJobId: 1 });
        expect(inserted).toStrictEqual({
            addedKeys: expect.arrayContaining(['1', '2', '3', '4']),
            updatedKeys: [],
            deletedKeys: [],
            billedKeys: expect.arrayContaining(['1', '2', '3', '4']),
            unchangedKeys: [],
            nonUniqueKeys: ['1'],
            nextMerging: { strategy: 'override' }
        });

        const newRecords = [
            { id: '1', name: 'John Doe' }, // same
            { id: '2', name: 'Jane Moe' } // updated
        ];
        const upserted = await upsertRecords({ records: newRecords, connectionId, environmentId, model, syncId, syncJobId: 2 });
        expect(upserted).toStrictEqual({
            addedKeys: [],
            updatedKeys: ['2'],
            billedKeys: [],
            unchangedKeys: ['1'],
            deletedKeys: [],
            nonUniqueKeys: [],
            nextMerging: { strategy: 'override' }
        });

        const after = await db.select<FormattedRecord[]>('*').from('nango_records.records').where({ connection_id: connectionId, model });
        expect(after.find((r) => r.external_id === '1')?.sync_job_id).toBe(2);
        expect(after.find((r) => r.external_id === '2')?.sync_job_id).toBe(2);
        expect(after.find((r) => r.external_id === '3')?.sync_job_id).toBe(1);
        expect(after.find((r) => r.external_id === '4')?.sync_job_id).toBe(1);

        const updated = await updateRecords({ records: [{ id: '1', name: 'Maurice Doe' }], connectionId, model, syncId, syncJobId: 3 });
        expect(updated).toStrictEqual({
            addedKeys: [],
            updatedKeys: ['1'],
            deletedKeys: [],
            billedKeys: [],
            unchangedKeys: [],
            nonUniqueKeys: [],
            nextMerging: { strategy: 'override' }
        });
    });

    describe('upserting records', () => {
        describe('should respect merging strategy', () => {
            it('when strategy = override', async () => {
                const connectionId = rnd.number();
                const environmentId = rnd.number();
                const model = rnd.string();
                const syncId = uuid.v4();
                const records = [
                    { id: '1', name: 'John Doe' },
                    { id: '1', name: 'John Doe' },
                    { id: '2', name: 'Jane Doe' },
                    { id: '3', name: 'Max Doe' },
                    { id: '4', name: 'Mike Doe' }
                ];
                const inserted = await upsertRecords({ records, connectionId, environmentId, model, syncId, syncJobId: 1 });
                expect(inserted).toStrictEqual({
                    addedKeys: expect.arrayContaining(['1', '2', '3', '4']),
                    updatedKeys: [],
                    deletedKeys: [],
                    billedKeys: expect.arrayContaining(['1', '2', '3', '4']),
                    unchangedKeys: [],
                    nonUniqueKeys: ['1'],
                    nextMerging: { strategy: 'override' }
                });

                const newRecords = [
                    { id: '1', name: 'John Doe' }, // same
                    { id: '2', name: 'Jane Moe' } // updated
                ];
                const upserted = await upsertRecords({ records: newRecords, connectionId, environmentId, model, syncId, syncJobId: 2 });
                expect(upserted).toStrictEqual({
                    addedKeys: [],
                    updatedKeys: ['2'],
                    deletedKeys: [],
                    billedKeys: [],
                    unchangedKeys: ['1'],
                    nonUniqueKeys: [],
                    nextMerging: { strategy: 'override' }
                });

                const after = await db.select<FormattedRecord[]>('*').from('nango_records.records').where({ connection_id: connectionId, model });
                expect(after.find((r) => r.external_id === '1')?.sync_job_id).toBe(2);
                expect(after.find((r) => r.external_id === '2')?.sync_job_id).toBe(2);
                expect(after.find((r) => r.external_id === '3')?.sync_job_id).toBe(1);
                expect(after.find((r) => r.external_id === '4')?.sync_job_id).toBe(1);
            });
            it('when strategy = ignore_if_modified_after_cursor', async () => {
                const connectionId = rnd.number();
                const environmentId = rnd.number();
                const model = rnd.string();
                const syncId = uuid.v4();
                const records = [
                    { id: '1', name: 'John Doe' },
                    { id: '2', name: 'Jane Doe' },
                    { id: '3', name: 'Max Doe' },
                    { id: '4', name: 'Mike Doe' }
                ];
                // insert initial records
                const inserted = await upsertRecords({
                    records,
                    connectionId,
                    environmentId,
                    model,
                    syncId,
                    syncJobId: 1,
                    merging: {
                        strategy: 'ignore_if_modified_after_cursor'
                    }
                });
                expect(inserted).toStrictEqual({
                    addedKeys: expect.arrayContaining(['1', '2', '3', '4']),
                    updatedKeys: [],
                    deletedKeys: [],
                    billedKeys: expect.arrayContaining(['1', '2', '3', '4']),
                    unchangedKeys: [],
                    nonUniqueKeys: [],
                    nextMerging: {
                        strategy: 'ignore_if_modified_after_cursor',
                        cursor: (await Records.getCursor({ connectionId, model, offset: 'last' })).unwrap()
                    }
                });

                // simulate records being modified after the cursor
                const moreRecords = [
                    { id: '4', name: 'Bob Doe' },
                    { id: '5', name: 'Another Doe' }
                ];
                const added = await upsertRecords({ records: moreRecords, connectionId, environmentId, model, syncId, syncJobId: 2 });
                expect(added).toStrictEqual({
                    addedKeys: ['5'],
                    updatedKeys: ['4'],
                    billedKeys: ['5'],
                    unchangedKeys: [],
                    deletedKeys: [],
                    nonUniqueKeys: [],
                    nextMerging: { strategy: 'override' }
                });

                // upsert records with merging strategy 'ignore_if_modified_after_cursor'
                const upserted = await upsertRecords({
                    records: [
                        { id: '1', name: 'Ken Doe' },
                        { id: '4', name: 'Bloom Doe' },
                        { id: '5', name: 'Yet Another Doe' }
                    ],
                    connectionId,
                    environmentId,
                    model,
                    syncId,
                    syncJobId: 3,
                    merging: inserted.nextMerging
                });
                // only '1' should be updated because '4' and '5' were modified after the cursor
                expect(upserted).toStrictEqual({
                    addedKeys: [],
                    updatedKeys: ['1'],
                    deletedKeys: [],
                    billedKeys: [],
                    unchangedKeys: [],
                    nonUniqueKeys: [],
                    nextMerging: {
                        strategy: 'ignore_if_modified_after_cursor',
                        cursor: (await Records.getCursor({ connectionId, model, offset: 'last' })).unwrap()
                    }
                });
            });
            it('when strategy = ignore_if_modified_after_cursor and saving same record', async () => {
                const environmentId = rnd.number();
                const connectionId = 1;
                const model = 'my-model';
                const syncId = uuid.v4();
                const records = [
                    { id: '1', name: 'John Doe' },
                    { id: '2', name: 'Jane Doe' },
                    { id: '3', name: 'Max Doe' }
                ];
                // insert initial records
                const inserted = await upsertRecords({
                    records,
                    connectionId,
                    environmentId,
                    model,
                    syncId,
                    syncJobId: 1,
                    merging: {
                        strategy: 'ignore_if_modified_after_cursor'
                    }
                });

                // upsert records with the same values
                const sameRecords = [
                    { id: '1', name: 'John Doe' }, // same
                    { id: '2', name: 'Jane Doe' } // same
                ];
                const result1 = await upsertRecords({
                    records: sameRecords,
                    connectionId,
                    environmentId,
                    model,
                    syncId,
                    syncJobId: 2,
                    merging: inserted.nextMerging
                });

                expect(result1).toStrictEqual({
                    addedKeys: [],
                    updatedKeys: [],
                    deletedKeys: [],
                    billedKeys: [],
                    unchangedKeys: ['1', '2'],
                    nonUniqueKeys: [],
                    nextMerging: {
                        strategy: 'ignore_if_modified_after_cursor',
                        cursor: (await Records.getCursor({ connectionId, model, offset: 'last' })).unwrap()
                    }
                });

                // upsert records with new values
                const modifiedRecords = [
                    { id: '3', name: 'Matt Doe' } // NOT the same
                ];
                const result2 = await upsertRecords({
                    records: modifiedRecords,
                    connectionId,
                    environmentId,
                    model,
                    syncId,
                    syncJobId: 2,
                    merging: result1.nextMerging
                });

                expect(result2).toStrictEqual({
                    addedKeys: [],
                    updatedKeys: ['3'],
                    deletedKeys: [],
                    billedKeys: [],
                    unchangedKeys: [],
                    nonUniqueKeys: [],
                    nextMerging: {
                        strategy: 'ignore_if_modified_after_cursor',
                        cursor: (await Records.getCursor({ connectionId, model, offset: 'last' })).unwrap()
                    }
                });
            });
        });

        it('Should return correct added records count when upserting concurrently', async () => {
            const connectionId = rnd.number();
            const environmentId = rnd.number();
            const model = rnd.string();
            const records = formatRecords({
                data: [{ id: '1', name: 'John Doe' }],
                connectionId,
                model,
                syncId: '00000000-0000-0000-0000-000000000000',
                syncJobId: 1,
                softDelete: false
            }).unwrap();

            // upserting the same record concurrently
            const res = (
                await Promise.all([
                    Records.upsert({ records, connectionId, environmentId, model }),
                    Records.upsert({ records, connectionId, environmentId, model }),
                    Records.upsert({ records, connectionId, environmentId, model }),
                    Records.upsert({ records, connectionId, environmentId, model }),
                    Records.upsert({ records, connectionId, environmentId, model })
                ])
            ).map((r) => r.unwrap());
            const agg = res.reduce((acc, curr) => {
                return {
                    addedKeys: acc.addedKeys.concat(curr.addedKeys),
                    updatedKeys: acc.updatedKeys.concat(curr.updatedKeys),
                    deletedKeys: (acc.deletedKeys || []).concat(curr.deletedKeys || []),
                    nonUniqueKeys: acc.nonUniqueKeys.concat(curr.nonUniqueKeys),
                    billedKeys: acc.billedKeys.concat(curr.billedKeys),
                    nextMerging: curr.nextMerging,
                    unchangedKeys: acc.unchangedKeys.concat(curr.unchangedKeys)
                };
            });
            expect(agg).toStrictEqual({
                addedKeys: ['1'],
                updatedKeys: [],
                deletedKeys: [],
                billedKeys: ['1'],
                nonUniqueKeys: [],
                unchangedKeys: ['1', '1', '1', '1'],
                nextMerging: { strategy: 'override' }
            });
        });
    });

    describe('updating records', () => {
        it('should deep merge records', async () => {
            const connectionId = rnd.number();
            const environmentId = rnd.number();
            const model = rnd.string();
            const syncId = uuid.v4();
            const records = [{ id: '1', person: { name: 'John Doe', age: 35, children: [{ name: 'Jenny Doe', age: 3 }] } }];

            const inserted = await upsertRecords({ records, connectionId, environmentId, model, syncId, syncJobId: 1 });
            expect(inserted).toStrictEqual({
                addedKeys: ['1'],
                updatedKeys: [],
                deletedKeys: [],
                billedKeys: ['1'],
                unchangedKeys: [],
                nonUniqueKeys: [],
                nextMerging: {
                    strategy: 'override'
                }
            });

            const updated = await updateRecords({
                records: [
                    {
                        id: '1',
                        person: {
                            age: 36,
                            children: [
                                { name: 'Jennifer Doe', age: 3 },
                                { name: 'Maurice Doe', age: 1 }
                            ]
                        }
                    }
                ],
                connectionId,
                model,
                syncId,
                syncJobId: 2
            });
            expect(updated).toStrictEqual({
                addedKeys: [],
                updatedKeys: ['1'],
                deletedKeys: [],
                billedKeys: [],
                unchangedKeys: [],
                nonUniqueKeys: [],
                nextMerging: {
                    strategy: 'override'
                }
            });

            const { records: found } = (await Records.getRecords({ connectionId, model })).unwrap();
            expect(found.length).toBe(1);
            expect(found?.[0]).toMatchObject({
                person: {
                    name: 'John Doe',
                    age: 36,
                    children: [
                        { name: 'Jennifer Doe', age: 3 },
                        { name: 'Maurice Doe', age: 1 }
                    ]
                }
            });
        });

        describe('should respect merging strategy', () => {
            it('when strategy = override', async () => {
                const connectionId = rnd.number();
                const environmentId = rnd.number();
                const model = rnd.string();
                const syncId = uuid.v4();
                const records = [
                    { id: '1', name: 'John Doe' },
                    { id: '1', name: 'John Doe' },
                    { id: '2', name: 'Jane Doe' },
                    { id: '3', name: 'Max Doe' },
                    { id: '4', name: 'Mike Doe' }
                ];
                const inserted = await upsertRecords({ records, connectionId, environmentId, model, syncId, syncJobId: 1 });
                expect(inserted).toStrictEqual({
                    addedKeys: expect.arrayContaining(['1', '2', '3', '4']),
                    updatedKeys: [],
                    deletedKeys: [],
                    billedKeys: expect.arrayContaining(['1', '2', '3', '4']),
                    unchangedKeys: [],
                    nonUniqueKeys: ['1'],
                    nextMerging: { strategy: 'override' }
                });

                const updated = await updateRecords({ records: [{ id: '1', name: 'Maurice Doe' }], connectionId, model, syncId, syncJobId: 2 });
                expect(updated).toStrictEqual({
                    addedKeys: [],
                    updatedKeys: ['1'],
                    deletedKeys: [],
                    billedKeys: [],
                    unchangedKeys: [],
                    nonUniqueKeys: [],
                    nextMerging: { strategy: 'override' }
                });
            });
            it('when strategy = ignore_if_modified_after_cursor', async () => {
                const connectionId = rnd.number();
                const environmentId = rnd.number();
                const model = rnd.string();
                const syncId = uuid.v4();
                const records = [
                    { id: '1', name: 'John Doe' },
                    { id: '2', name: 'Jane Doe' },
                    { id: '3', name: 'Max Doe' },
                    { id: '4', name: 'Mike Doe' }
                ];

                // insert initial records
                const inserted = await upsertRecords({
                    records,
                    connectionId,
                    environmentId,
                    model,
                    syncId,
                    syncJobId: 1,
                    merging: { strategy: 'ignore_if_modified_after_cursor' }
                });
                expect(inserted).toStrictEqual({
                    addedKeys: expect.arrayContaining(['1', '2', '3', '4']),
                    updatedKeys: [],
                    deletedKeys: [],
                    billedKeys: expect.arrayContaining(['1', '2', '3', '4']),
                    unchangedKeys: [],
                    nonUniqueKeys: [],
                    nextMerging: {
                        strategy: 'ignore_if_modified_after_cursor',
                        cursor: (await Records.getCursor({ connectionId, model, offset: 'last' })).unwrap()
                    }
                });

                // simulate an records being modified after the cursor
                const updated = await updateRecords({
                    records: [{ id: '4', name: 'Maurice Doe' }],
                    connectionId,
                    model,
                    syncId,
                    syncJobId: 2
                });
                expect(updated).toStrictEqual({
                    addedKeys: [],
                    updatedKeys: ['4'],
                    deletedKeys: [],
                    billedKeys: [],
                    unchangedKeys: [],
                    nonUniqueKeys: [],
                    nextMerging: { strategy: 'override' }
                });

                // update records with merging strategy 'ignore_if_modified_after_cursor'
                const upserted = await updateRecords({
                    records: [
                        { id: '1', name: 'Ken Doe' },
                        { id: '4', name: 'Bloom Doe' }
                    ],
                    connectionId,
                    model,
                    syncId,
                    syncJobId: 3,
                    merging: inserted.nextMerging
                });
                // only '1' should be updated because '4' were modified after the cursor
                const nextCursor = (await Records.getCursor({ connectionId, model, offset: 'last' })).unwrap();
                expect(upserted).toStrictEqual({
                    addedKeys: [],
                    updatedKeys: ['1'],
                    deletedKeys: [],
                    billedKeys: [],
                    unchangedKeys: [],
                    nonUniqueKeys: [],
                    nextMerging: { strategy: 'ignore_if_modified_after_cursor', cursor: nextCursor }
                });
            });
        });
    });

    it('Should be able to encrypt and insert 2000 records under 2 seconds', async () => {
        const connectionId = rnd.number();
        const environmentId = rnd.number();
        const model = rnd.string();
        const syncId = uuid.v4();
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
        const res = await upsertRecords({ records, connectionId, environmentId, model, syncId });
        const end = Date.now();

        expect(res.addedKeys.length).toStrictEqual(2000);
        expect(res.updatedKeys.length).toStrictEqual(0);
        expect(res.deletedKeys?.length).toStrictEqual(0);
        expect(res.nonUniqueKeys.length).toStrictEqual(0);
        expect(end - start).toBeLessThan(2000);
    });

    it('Should delete records', async () => {
        const connectionId = rnd.number();
        const environmentId = rnd.number();
        const model = rnd.string();
        const syncId = uuid.v4();
        const records = [
            { id: '1', name: 'John Doe' },
            { id: '2', name: 'Jane Doe' },
            { id: '3', name: 'Max Doe' }
        ];
        await upsertRecords({ records, connectionId, environmentId, model, syncId });

        const toDelete = [
            { id: '1', name: 'John Doe' },
            { id: '2', name: 'Jane Doe' }
        ];
        const res1 = await upsertRecords({ records: toDelete, connectionId, environmentId, model, syncId, softDelete: true });
        expect(res1).toStrictEqual({
            addedKeys: [],
            updatedKeys: [],
            deletedKeys: expect.arrayContaining(['1', '2']),
            billedKeys: [],
            unchangedKeys: [],
            nonUniqueKeys: [],
            nextMerging: { strategy: 'override' }
        });

        // Try to delete the same records again
        // Should not have any effect
        const res2 = await upsertRecords({ records: toDelete, connectionId, environmentId, model, syncId, softDelete: true });
        expect(res2).toStrictEqual({
            addedKeys: [],
            updatedKeys: [],
            deletedKeys: [],
            billedKeys: [],
            unchangedKeys: [],
            nonUniqueKeys: [],
            nextMerging: { strategy: 'override' }
        });
    });

    describe('getRecords', () => {
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

        it('Should retrieve records by external_id', async () => {
            const { connectionId, model } = await upsertNRecords(10);

            const response = await Records.getRecords({
                connectionId,
                model,
                externalIds: ['1', '3', '5']
            });

            expect(response.isOk()).toBe(true);
            const { records } = response.unwrap();

            expect(records.length).toBe(3);
            expect(records).toContainEqual(expect.objectContaining({ id: '1' }));
            expect(records).toContainEqual(expect.objectContaining({ id: '3' }));
            expect(records).toContainEqual(expect.objectContaining({ id: '5' }));
        });

        it('should filter out 0x00 in ids', async () => {
            const connectionId = rnd.number();
            const environmentId = rnd.number();
            const model = rnd.string();
            const syncId = uuid.v4();
            const toInsert = [{ id: '1', name: 'John Doe' }];
            await upsertRecords({ records: toInsert, connectionId, environmentId, model, syncId });

            const response = await Records.getRecords({ connectionId, model, externalIds: ['\x001'] });

            expect(response.isOk()).toBe(true);
            const { records } = response.unwrap();

            expect(records.length).toBe(1);
            expect(records).toContainEqual(expect.objectContaining({ id: '1', name: 'John Doe' }));
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
});

async function upsertNRecords(n: number): Promise<{ connectionId: number; model: string; syncId: string; result: UpsertSummary }> {
    const records = Array.from({ length: n }, (_, i) => ({ id: `${i}`, name: `record ${i}` }));
    const connectionId = rnd.number();
    const environmentId = rnd.number();
    const model = 'model-' + rnd.string();
    const syncId = uuid.v4();
    const result = await upsertRecords({ records, connectionId, environmentId, model, syncId });
    return {
        connectionId,
        model,
        syncId,
        result
    };
}

async function upsertRecords({
    records,
    connectionId,
    environmentId,
    model,
    syncId,
    syncJobId = rnd.number(),
    softDelete = false,
    merging = { strategy: 'override' }
}: {
    records: UnencryptedRecordData[];
    connectionId: number;
    environmentId: number;
    model: string;
    syncId: string;
    syncJobId?: number;
    softDelete?: boolean;
    merging?: MergingStrategy;
}): Promise<UpsertSummary> {
    const formatRes = formatRecords({ data: records, connectionId, model, syncId, syncJobId, softDelete });
    if (formatRes.isErr()) {
        throw new Error(`Failed to format records: ${formatRes.error.message}`);
    }
    const upsertRes = await Records.upsert({ records: formatRes.value, connectionId, environmentId, model, softDelete, merging });
    if (upsertRes.isErr()) {
        throw new Error(`Failed to update records: ${upsertRes.error.message}`);
    }
    return upsertRes.value;
}

async function updateRecords({
    records,
    connectionId,
    model,
    syncId,
    syncJobId = rnd.number(),
    merging = { strategy: 'override' }
}: {
    records: UnencryptedRecordData[];
    connectionId: number;
    model: string;
    syncId: string;
    syncJobId?: number;
    merging?: MergingStrategy;
}) {
    const formatRes = formatRecords({ data: records, connectionId, model, syncId, syncJobId });
    if (formatRes.isErr()) {
        throw new Error(`Failed to format records: ${formatRes.error.message}`);
    }
    const updateRes = await Records.update({ records: formatRes.value, connectionId, model, merging });
    if (updateRes.isErr()) {
        throw new Error(`Failed to update records: ${updateRes.error.message}`);
    }
    return updateRes.value;
}

const rnd = {
    number: () => Math.floor(Math.random() * 1000),
    string: () => Math.random().toString(36).substring(6)
};
