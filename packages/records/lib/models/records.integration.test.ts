import dayjs from 'dayjs';
import * as uuid from 'uuid';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { RECORDS_TABLE, RECORD_COUNTS_TABLE } from '../constants.js';
import { Cursor } from '../cursor.js';
import { db } from '../db/client.js';
import { migrate } from '../db/migrate.js';
import { formatRecords } from '../helpers/format.js';
import * as Records from '../models/records.js';

import type { FormattedRecord, UnencryptedRecordData, UpsertSummary } from '../types.js';
import type { MergingStrategy, Result } from '@nangohq/types';

describe('Records service', () => {
    beforeAll(async () => {
        await migrate();
    });

    afterAll(async () => {
        await db(RECORDS_TABLE).truncate();
        await db(RECORD_COUNTS_TABLE).truncate();
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
            activatedKeys: expect.arrayContaining(['1', '2', '3', '4']),
            unchangedKeys: [],
            nonUniqueKeys: ['1'],
            nextMerging: { strategy: 'override' }
        });
        let stats = (await Records.getCountsByModel({ connectionId, environmentId })).unwrap();
        expect(stats[model]?.count).toBe(4);
        expect(stats[model]?.size_bytes).toBe(536);

        const newRecords = [
            { id: '1', name: 'John Doe' }, // same
            { id: '2', name: 'Jane Much Longer Name Doe' } // updated
        ];
        const upserted = await upsertRecords({ records: newRecords, connectionId, environmentId, model, syncId, syncJobId: 2 });
        expect(upserted).toStrictEqual({
            addedKeys: [],
            updatedKeys: ['2'],
            activatedKeys: [],
            unchangedKeys: ['1'],
            deletedKeys: [],
            nonUniqueKeys: [],
            nextMerging: { strategy: 'override' }
        });
        stats = (await Records.getCountsByModel({ connectionId, environmentId })).unwrap();
        expect(stats[model]?.count).toBe(4);
        expect(stats[model]?.size_bytes).toBe(556);

        const after = await db.select<FormattedRecord[]>('*').from('nango_records.records').where({ connection_id: connectionId, model });
        expect(after.find((r) => r.external_id === '1')?.sync_job_id).toBe(2);
        expect(after.find((r) => r.external_id === '2')?.sync_job_id).toBe(2);
        expect(after.find((r) => r.external_id === '3')?.sync_job_id).toBe(1);
        expect(after.find((r) => r.external_id === '4')?.sync_job_id).toBe(1);

        const updated = await updateRecords({ records: [{ id: '1', name: 'Maurice Doe' }], connectionId, environmentId, model, syncId, syncJobId: 3 });
        expect(updated).toStrictEqual({
            addedKeys: [],
            updatedKeys: ['1'],
            deletedKeys: [],
            activatedKeys: [],
            unchangedKeys: [],
            nonUniqueKeys: [],
            nextMerging: { strategy: 'override' }
        });
        stats = (await Records.getCountsByModel({ connectionId, environmentId })).unwrap();
        expect(stats[model]?.count).toBe(4);
        expect(stats[model]?.size_bytes).toBe(560);
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
                    activatedKeys: expect.arrayContaining(['1', '2', '3', '4']),
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
                    activatedKeys: [],
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
                    activatedKeys: expect.arrayContaining(['1', '2', '3', '4']),
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
                    activatedKeys: ['5'],
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
                    activatedKeys: [],
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
                    activatedKeys: [],
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
                    activatedKeys: [],
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

            // upserting the same record concurrently
            const upsert = async (): Promise<Result<UpsertSummary>> => {
                const records = formatRecords({
                    data: [{ id: '1', name: 'John Doe!!!!' }],
                    connectionId,
                    model,
                    syncId: '00000000-0000-0000-0000-000000000000',
                    syncJobId: 1,
                    softDelete: false
                }).unwrap();
                return Records.upsert({ records, connectionId, environmentId, model });
            };
            const res = (await Promise.all([upsert(), upsert(), upsert(), upsert(), upsert()])).map((r) => r.unwrap());

            const agg = res.reduce((acc, curr) => {
                return {
                    addedKeys: acc.addedKeys.concat(curr.addedKeys),
                    updatedKeys: acc.updatedKeys.concat(curr.updatedKeys),
                    deletedKeys: (acc.deletedKeys || []).concat(curr.deletedKeys || []),
                    nonUniqueKeys: acc.nonUniqueKeys.concat(curr.nonUniqueKeys),
                    activatedKeys: acc.activatedKeys.concat(curr.activatedKeys),
                    nextMerging: curr.nextMerging,
                    unchangedKeys: acc.unchangedKeys.concat(curr.unchangedKeys)
                };
            });
            expect(agg).toStrictEqual({
                addedKeys: ['1'],
                updatedKeys: [],
                deletedKeys: [],
                activatedKeys: ['1'],
                nonUniqueKeys: [],
                unchangedKeys: ['1', '1', '1', '1'],
                nextMerging: { strategy: 'override' }
            });
            const stats = (await Records.getCountsByModel({ connectionId, environmentId })).unwrap();
            expect(stats[model]?.count).toBe(1);
            expect(stats[model]?.size_bytes).toBe(139);
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
                activatedKeys: ['1'],
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
                environmentId,
                model,
                syncId,
                syncJobId: 2
            });
            expect(updated).toStrictEqual({
                addedKeys: [],
                updatedKeys: ['1'],
                deletedKeys: [],
                activatedKeys: [],
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
                    activatedKeys: expect.arrayContaining(['1', '2', '3', '4']),
                    unchangedKeys: [],
                    nonUniqueKeys: ['1'],
                    nextMerging: { strategy: 'override' }
                });

                const updated = await updateRecords({ records: [{ id: '1', name: 'Maurice Doe' }], connectionId, environmentId, model, syncId, syncJobId: 2 });
                expect(updated).toStrictEqual({
                    addedKeys: [],
                    updatedKeys: ['1'],
                    deletedKeys: [],
                    activatedKeys: [],
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
                    activatedKeys: expect.arrayContaining(['1', '2', '3', '4']),
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
                    environmentId,
                    model,
                    syncId,
                    syncJobId: 2
                });
                expect(updated).toStrictEqual({
                    addedKeys: [],
                    updatedKeys: ['4'],
                    deletedKeys: [],
                    activatedKeys: [],
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
                    environmentId,
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
                    activatedKeys: [],
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
        let stats = (await Records.getCountsByModel({ connectionId, environmentId })).unwrap();
        expect(stats[model]?.count).toBe(3);
        expect(stats[model]?.size_bytes).toBe(401);

        const toDelete = [
            { id: '1', name: 'John Doe' },
            { id: '2', name: 'Jane Doe' }
        ];
        const res1 = await upsertRecords({ records: toDelete, connectionId, environmentId, model, syncId, softDelete: true });
        expect(res1).toStrictEqual({
            addedKeys: [],
            updatedKeys: [],
            deletedKeys: expect.arrayContaining(['1', '2']),
            activatedKeys: [],
            unchangedKeys: [],
            nonUniqueKeys: [],
            nextMerging: { strategy: 'override' }
        });

        stats = (await Records.getCountsByModel({ connectionId, environmentId })).unwrap();
        expect(stats[model]?.count).toBe(1);
        expect(stats[model]?.size_bytes).toBe(401); // size remains the same since we are soft deleting

        // Try to delete the same records again
        // Should not have any effect
        const res2 = await upsertRecords({ records: toDelete, connectionId, environmentId, model, syncId, softDelete: true });
        expect(res2).toStrictEqual({
            addedKeys: [],
            updatedKeys: [],
            deletedKeys: [],
            activatedKeys: [],
            unchangedKeys: [],
            nonUniqueKeys: [],
            nextMerging: { strategy: 'override' }
        });
        stats = (await Records.getCountsByModel({ connectionId, environmentId })).unwrap();
        expect(stats[model]?.count).toBe(1);
        expect(stats[model]?.size_bytes).toBe(401);
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

    describe('markPreviousGenerationRecordsAsDeleted', () => {
        it('should mark records from previous generations as deleted', async () => {
            const connectionId = rnd.number();
            const environmentId = rnd.number();
            const model = rnd.string();
            const syncId = uuid.v4();

            // Insert records with different generations
            const recordsGen1 = [
                { id: '1', name: 'John Doe' },
                { id: '2', name: 'Jane Doe' }
            ];
            const recordsGen2 = [
                { id: '3', name: 'Max Doe' },
                { id: '4', name: 'Mike Doe' }
            ];
            const recordsGen3 = [{ id: '5', name: 'Alice Doe' }];

            await upsertRecords({ records: recordsGen1, connectionId, environmentId, model, syncId, syncJobId: 1 });
            await upsertRecords({ records: recordsGen2, connectionId, environmentId, model, syncId, syncJobId: 2 });
            await upsertRecords({ records: recordsGen3, connectionId, environmentId, model, syncId, syncJobId: 3 });

            // Mark previous generations (1 and 2) as deleted
            const deletedIds = (
                await Records.deleteOutdatedRecords({
                    environmentId,
                    connectionId,
                    model,
                    generation: 3
                })
            ).unwrap();

            expect(deletedIds).toHaveLength(4);
            expect(deletedIds).toEqual(expect.arrayContaining(['1', '2', '3', '4']));

            // Check that the records are marked as deleted
            const deleted = await db
                .select<FormattedRecord[]>('*')
                .from(RECORDS_TABLE)
                .where({ connection_id: connectionId, model })
                .whereNotNull('deleted_at');
            deleted.forEach((r) => {
                expect(r.sync_job_id).toBe(3);
                expect(r.deleted_at).not.toBeNull();
            });
        });

        it('should not mark already deleted records', async () => {
            const connectionId = rnd.number();
            const environmentId = rnd.number();
            const model = rnd.string();
            const syncId = uuid.v4();

            // Insert and then soft delete some records
            const rec1 = { id: '1', name: 'John Doe' };
            const rec2 = { id: '2', name: 'Jane Doe' };
            await upsertRecords({ records: [rec1, rec2], connectionId, environmentId, model, syncId, syncJobId: 1 });
            await upsertRecords({ records: [rec1], connectionId, environmentId, model, syncId, syncJobId: 2, softDelete: true });

            // Mark previous generation as deleted
            const deletedIds = (
                await Records.deleteOutdatedRecords({
                    environmentId,
                    connectionId,
                    model,
                    generation: 3
                })
            ).unwrap();

            // Only the non-deleted record should be marked as deleted
            expect(deletedIds).toEqual(['2']);
        });

        it('should process records in batches', async () => {
            const connectionId = rnd.number();
            const environmentId = rnd.number();
            const model = rnd.string();
            const syncId = uuid.v4();
            const count = 10;

            const records = Array.from({ length: count }, (_, i) => ({ id: `${i}`, name: `record ${i}` }));
            await upsertRecords({ records, connectionId, environmentId, model, syncId, syncJobId: 1 });
            // Insert an additional record to ensure total count is correct
            await upsertRecords({ records: [{ id: '99', name: '99' }], connectionId, environmentId, model, syncId, syncJobId: 2 });

            const initialStats = (await Records.getCountsByModel({ connectionId, environmentId })).unwrap();
            expect(initialStats[model]?.count).toBe(11);

            const deletedIds = (
                await Records.deleteOutdatedRecords({
                    environmentId,
                    connectionId,
                    model,
                    generation: 2,
                    batchSize: 3 // small batch size
                })
            ).unwrap();
            expect(deletedIds).toHaveLength(count);

            const finalStats = (await Records.getCountsByModel({ connectionId, environmentId })).unwrap();
            expect(finalStats[model]?.count).toBe(1); // only the last record should remain
        });

        it('should update record counts correctly', async () => {
            const connectionId = rnd.number();
            const environmentId = rnd.number();
            const model = rnd.string();
            const syncId = uuid.v4();

            const records = [
                { id: '1', name: 'John Doe' },
                { id: '2', name: 'Jane Doe' },
                { id: '3', name: 'Max Doe' }
            ];

            await upsertRecords({ records, connectionId, environmentId, model, syncId, syncJobId: 1 });

            const initialStats = (await Records.getCountsByModel({ connectionId, environmentId })).unwrap();
            expect(initialStats[model]?.count).toBe(3);

            const deletedIds = (
                await Records.deleteOutdatedRecords({
                    environmentId,
                    connectionId,
                    model,
                    generation: 2
                })
            ).unwrap();
            expect(deletedIds).toHaveLength(3);

            const finalStats = (await Records.getCountsByModel({ connectionId, environmentId })).unwrap();
            expect(finalStats[model]?.count).toBe(0);
        });
    });

    describe('paginateCounts', () => {
        it('should paginate through record counts', async () => {
            // Clear existing records and counts
            await db(RECORDS_TABLE).truncate();
            await db(RECORD_COUNTS_TABLE).truncate();

            const res1 = await upsertNRecords(15);
            const res2 = await upsertNRecords(25);
            const res3 = await upsertNRecords(35);

            const received = [];
            for await (const res of Records.paginateCounts({ batchSize: 2 })) {
                if (res.isErr()) {
                    throw res.error;
                }
                received.push(...res.value);
            }

            expect(received).toHaveLength(3);
            expect(received).toEqual(
                expect.arrayContaining([
                    {
                        environment_id: res1.environmentId,
                        connection_id: res1.connectionId,
                        model: res1.model,
                        count: 15,
                        size_bytes: expect.any(String),
                        updated_at: expect.any(Date)
                    },
                    {
                        environment_id: res2.environmentId,
                        connection_id: res2.connectionId,
                        model: res2.model,
                        count: 25,
                        size_bytes: expect.any(String),
                        updated_at: expect.any(Date)
                    },
                    {
                        environment_id: res3.environmentId,
                        connection_id: res3.connectionId,
                        model: res3.model,
                        count: 35,
                        size_bytes: expect.any(String),
                        updated_at: expect.any(Date)
                    }
                ])
            );
        });
        it('should paginate through record counts for specific environments', async () => {
            const res1 = await upsertNRecords(10);
            const res2 = await upsertNRecords(30);
            await upsertNRecords(20);

            const targetEnvironments = [res1.environmentId, res2.environmentId];

            const received = [];
            for await (const res of Records.paginateCounts({ environmentIds: targetEnvironments, batchSize: 2 })) {
                if (res.isErr()) {
                    throw res.error;
                }
                received.push(...res.value);
            }

            expect(received).toHaveLength(2);
            expect(received).toEqual(
                expect.arrayContaining([
                    {
                        environment_id: res1.environmentId,
                        connection_id: res1.connectionId,
                        model: res1.model,
                        count: 10,
                        size_bytes: expect.any(String),
                        updated_at: expect.any(Date)
                    },
                    {
                        environment_id: res2.environmentId,
                        connection_id: res2.connectionId,
                        model: res2.model,
                        count: 30,
                        size_bytes: expect.any(String),
                        updated_at: expect.any(Date)
                    }
                ])
            );
        });
    });

    describe('deleteRecords', () => {
        it('should delete all records for given connection/model', async () => {
            const connectionId = rnd.number();
            const environmentId = rnd.number();
            const model = rnd.string();
            const syncId = uuid.v4();

            const records = [
                { id: '1', name: 'John Doe' },
                { id: '2', name: 'Jane Doe' },
                { id: '3', name: 'Max Doe' },
                { id: '4', name: 'Mike Doe' },
                { id: '5', name: 'Alice Doe' }
            ];
            await upsertRecords({ records, connectionId, environmentId, model, syncId });

            let stats = (await Records.getCountsByModel({ connectionId, environmentId })).unwrap();
            expect(stats[model]?.count).toBe(records.length);

            const deletedCount = (await Records.deleteRecords({ connectionId, environmentId, model, mode: 'hard', batchSize: 2 })).unwrap();
            expect(deletedCount.count).toBe(records.length);

            stats = (await Records.getCountsByModel({ connectionId, environmentId })).unwrap();
            expect(stats[model]).toBe(undefined);

            const res = (await Records.getRecords({ connectionId, model })).unwrap();
            expect(res.records.length).toBe(0);
        });

        it('should delete only specified limit and update count/size correctly', async () => {
            const connectionId = rnd.number();
            const environmentId = rnd.number();
            const model = rnd.string();
            const syncId = uuid.v4();

            const records = [
                { id: '1', name: 'John Doe' },
                { id: '2', name: 'Jane Doe' },
                { id: '3', name: 'Max Doe' },
                { id: '4', name: 'Mike Doe' },
                { id: '5', name: 'Alice Doe' }
            ];
            await upsertRecords({ records, connectionId, environmentId, model, syncId });

            const initialStats = (await Records.getCountsByModel({ connectionId, environmentId })).unwrap();
            expect(initialStats[model]?.count).toBe(5);
            const initialSize = initialStats[model]?.size_bytes || 0;

            const deletedCount = (await Records.deleteRecords({ connectionId, environmentId, model, mode: 'hard', limit: 3 })).unwrap();
            expect(deletedCount.count).toBe(3);

            const finalStats = (await Records.getCountsByModel({ connectionId, environmentId })).unwrap();
            expect(finalStats[model]?.count).toBe(2);
            expect(finalStats[model]?.size_bytes).toBeLessThan(initialSize);

            const res = (await Records.getRecords({ connectionId, model })).unwrap();
            expect(res.records.length).toBe(2);
        });

        it('should delete count entry when all records are deleted', async () => {
            const connectionId = rnd.number();
            const environmentId = rnd.number();
            const model = rnd.string();
            const syncId = uuid.v4();

            const records = [
                { id: '1', name: 'John Doe' },
                { id: '2', name: 'Jane Doe' }
            ];
            await upsertRecords({ records, connectionId, environmentId, model, syncId });

            const deletedCount = (await Records.deleteRecords({ connectionId, environmentId, model, mode: 'hard', limit: 2 })).unwrap();
            expect(deletedCount.count).toBe(2);

            const finalStats = (await Records.getCountsByModel({ connectionId, environmentId })).unwrap();
            expect(finalStats[model]).toBeUndefined();
        });

        it('should return error for invalid limit values', async () => {
            const connectionId = rnd.number();
            const environmentId = rnd.number();
            const model = rnd.string();

            const zeroResult = await Records.deleteRecords({ connectionId, environmentId, model, mode: 'hard', limit: 0 });
            expect(zeroResult.isErr()).toBe(true);
            if (zeroResult.isErr()) {
                expect(zeroResult.error.message).toBe('limit must be greater than 0');
            }

            const negativeResult = await Records.deleteRecords({ connectionId, environmentId, model, mode: 'hard', limit: -5 });
            expect(negativeResult.isErr()).toBe(true);
            if (negativeResult.isErr()) {
                expect(negativeResult.error.message).toBe('limit must be greater than 0');
            }
        });

        it('should delete records up to specified cursor', async () => {
            const connectionId = rnd.number();
            const environmentId = rnd.number();
            const model = rnd.string();
            const syncId = uuid.v4();

            const records = [
                { id: '1', name: 'John Doe' },
                { id: '2', name: 'Jane Doe' },
                { id: '3', name: 'Max Doe' },
                { id: '4', name: 'Mike Doe' },
                { id: '5', name: 'Alice Doe' },
                { id: '6', name: 'Bob Doe' },
                { id: '7', name: 'Charlie Doe' },
                { id: '8', name: 'David Doe' },
                { id: '9', name: 'Eve Doe' },
                { id: '10', name: 'Frank Doe' }
            ];
            await upsertRecords({ records, connectionId, environmentId, model, syncId });

            const inserted = (await Records.getRecords({ connectionId, model })).unwrap();
            expect(inserted.records.length).toBe(records.length);

            const toDelete = 4;
            const someRecordCursor = inserted.records[toDelete - 1]?._nango_metadata.cursor;
            expect(someRecordCursor).toBeDefined();

            const deletion = (
                await Records.deleteRecords({
                    connectionId,
                    environmentId,
                    model,
                    mode: 'hard',
                    toCursorIncluded: someRecordCursor!,
                    limit: 100
                })
            ).unwrap();

            expect(deletion.count).toBe(toDelete);
            expect(deletion.lastCursor).toBe(someRecordCursor);

            const remaining = (await Records.getRecords({ connectionId, model })).unwrap();
            expect(remaining.records.length).toBe(records.length - toDelete);

            const remainingIds = remaining.records.map((r) => r.id);
            expect(remainingIds).toEqual(expect.arrayContaining(inserted.records.slice(toDelete).map((r) => r.id)));

            const stats = (await Records.getCountsByModel({ connectionId, environmentId })).unwrap();
            expect(stats[model]?.count).toBe(records.length - toDelete);
        });

        it('should return null lastCursor when no records deleted', async () => {
            const connectionId = rnd.number();
            const environmentId = rnd.number();
            const model = rnd.string();

            const deleteResult = (await Records.deleteRecords({ connectionId, environmentId, model, mode: 'hard' })).unwrap();

            expect(deleteResult.count).toBe(0);
            expect(deleteResult.lastCursor).toBeNull();
        });

        it('should respect cursor boundary when deleting in batches', async () => {
            const connectionId = rnd.number();
            const environmentId = rnd.number();
            const model = rnd.string();
            const syncId = uuid.v4();

            const records = Array.from({ length: 20 }, (_, i) => ({
                id: `${i + 1}`,
                name: `Record ${i + 1}`
            }));
            await upsertRecords({ records, connectionId, environmentId, model, syncId });

            const allRecords = (await Records.getRecords({ connectionId, model })).unwrap();
            const twelfthRecordCursor = allRecords.records[11]?._nango_metadata.cursor;
            expect(twelfthRecordCursor).toBeDefined();

            const deleteResult = (
                await Records.deleteRecords({
                    connectionId,
                    environmentId,
                    model,
                    mode: 'hard',
                    toCursorIncluded: twelfthRecordCursor!,
                    batchSize: 7
                })
            ).unwrap();

            expect(deleteResult.count).toBe(12);
            expect(deleteResult.lastCursor).toBe(twelfthRecordCursor);

            const remainingRecords = (await Records.getRecords({ connectionId, model })).unwrap();
            expect(remainingRecords.records.length).toBe(8);
        });

        it('should return error for invalid cursor', async () => {
            const connectionId = rnd.number();
            const environmentId = rnd.number();
            const model = rnd.string();

            const invalidCursorResult = await Records.deleteRecords({
                connectionId,
                environmentId,
                model,
                mode: 'hard',
                toCursorIncluded: 'invalid-cursor-value'
            });

            expect(invalidCursorResult.isErr()).toBe(true);
            if (invalidCursorResult.isErr()) {
                expect(invalidCursorResult.error.message).toBe('invalid_cursor_value');
            }
        });

        it('should prune records when mode = prune', async () => {
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

            const statsBefore = (await Records.getCountsByModel({ connectionId, environmentId })).unwrap();

            const recs = (await Records.getRecords({ connectionId, model })).unwrap();
            const last = recs.records[recs.records.length - 1]!;
            const cursor = last._nango_metadata.cursor;

            // update last record to ensure it is not pruned and correct cursor is returned
            await upsertRecords({ records: [{ id: last.id, name: 'Maxwell Doe' }], connectionId, environmentId, model, syncId });

            // prune all records but the last one that was just updated
            const prune = (await Records.deleteRecords({ connectionId, environmentId, model, mode: 'prune', toCursorIncluded: cursor })).unwrap();
            expect(prune.count).toBe(2);
            expect(prune.lastCursor).toBe(recs.records[recs.records.length - 2]!._nango_metadata.cursor); // second last record's cursor since last record was updated and not deleted

            // try to prune again, should not do anything
            const prune2 = (await Records.deleteRecords({ connectionId, environmentId, model, mode: 'prune', toCursorIncluded: cursor })).unwrap();
            expect(prune2.count).toBe(0);
            expect(prune2.lastCursor).toBeNull();

            const res = (await Records.getRecords({ connectionId, model })).unwrap();
            expect(res.records.length).toBe(3);
            res.records.forEach((r) => {
                if (r.id === last.id) {
                    expect(r._nango_metadata.last_action).toBe('UPDATED');
                    expect(r._nango_metadata.pruned_at).toBeNull();
                } else {
                    expect(r.id).toBeDefined();
                    expect(r._nango_metadata.last_action).toBe('ADDED');
                    expect(r._nango_metadata.pruned_at).not.toBeNull();
                }
            });

            // count should remain the same but size should be reduced
            const stats = (await Records.getCountsByModel({ connectionId, environmentId })).unwrap();
            expect(stats[model]?.count).toBe(3);
            expect(stats[model]?.size_bytes).toBeLessThan(statsBefore[model]?.size_bytes || 0);
        });

        it('should simulate hard deletion when dryRun = true', async () => {
            const connectionId = rnd.number();
            const environmentId = rnd.number();
            const model = rnd.string();
            const syncId = uuid.v4();

            const records = [
                { id: '1', name: 'John Doe' },
                { id: '2', name: 'Jane Doe' },
                { id: '3', name: 'Max Doe' },
                { id: '4', name: 'Mike Doe' },
                { id: '5', name: 'Alice Doe' }
            ];
            await upsertRecords({ records, connectionId, environmentId, model, syncId });

            const statsBefore = (await Records.getCountsByModel({ connectionId, environmentId })).unwrap();
            expect(statsBefore[model]?.count).toBe(5);
            const initialSize = statsBefore[model]?.size_bytes || 0;

            const res = (
                await Records.deleteRecords({
                    connectionId,
                    environmentId,
                    model,
                    mode: 'hard',
                    limit: 3,
                    dryRun: true
                })
            ).unwrap();

            // Should report what would be deleted
            expect(res.count).toBe(3);
            expect(res.lastCursor).toBeDefined();

            // Verify records were not actually deleted
            const statsAfterDryRun = (await Records.getCountsByModel({ connectionId, environmentId })).unwrap();
            expect(statsAfterDryRun[model]?.count).toBe(5);
            expect(statsAfterDryRun[model]?.size_bytes).toBe(initialSize);

            const recordsAfterDryRun = (await Records.getRecords({ connectionId, model })).unwrap();
            expect(recordsAfterDryRun.records.length).toBe(5);
        });

        it('should simulate soft deletion when dryRun = true', async () => {
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

            const res = (
                await Records.deleteRecords({
                    connectionId,
                    environmentId,
                    model,
                    mode: 'soft',
                    dryRun: true
                })
            ).unwrap();

            // Should report what would be deleted
            expect(res.count).toBe(3);
            expect(res.lastCursor).toBeDefined();

            // Verify records were not actually deleted
            const recordsAfterDryRun = (await Records.getRecords({ connectionId, model, filter: 'deleted' })).unwrap();
            expect(recordsAfterDryRun.records.length).toBe(0);

            const allRecords = (await Records.getRecords({ connectionId, model })).unwrap();
            expect(allRecords.records.length).toBe(3);
            allRecords.records.forEach((r) => {
                expect(r._nango_metadata.deleted_at).toBeNull();
            });
        });

        it('should simulate pruning when dryRun = true', async () => {
            const connectionId = rnd.number();
            const environmentId = rnd.number();
            const model = rnd.string();
            const syncId = uuid.v4();

            const records = [
                { id: '1', name: 'John Doe' },
                { id: '2', name: 'Jane Doe' }
            ];
            await upsertRecords({ records, connectionId, environmentId, model, syncId });

            const statsBefore = (await Records.getCountsByModel({ connectionId, environmentId })).unwrap();
            const initialSize = statsBefore[model]?.size_bytes || 0;

            const res = (
                await Records.deleteRecords({
                    connectionId,
                    environmentId,
                    model,
                    mode: 'prune',
                    dryRun: true
                })
            ).unwrap();

            expect(res.count).toBe(2);
            expect(res.lastCursor).toBeDefined();

            // Verify records were not actually pruned
            const recordsAfterDryRun = (await Records.getRecords({ connectionId, model })).unwrap();
            expect(recordsAfterDryRun.records.length).toBe(2);
            recordsAfterDryRun.records.forEach((r) => {
                expect(r._nango_metadata.pruned_at).toBeNull();
                expect(r['name']).toBeDefined(); // payload still exists
            });

            // Size should remain unchanged
            const statsAfterDryRun = (await Records.getCountsByModel({ connectionId, environmentId })).unwrap();
            expect(statsAfterDryRun[model]?.size_bytes).toBe(initialSize);
        });
    });

    describe('incrCount', () => {
        it('should insert record count when it does not exist', async () => {
            const connectionId = rnd.number();
            const environmentId = rnd.number();
            const model = rnd.string();

            const newCount = await Records.incrCount(db, {
                connectionId,
                environmentId,
                model,
                delta: 5,
                deltaSizeInBytes: 1000
            });

            expect(newCount.count).toBe(5);
            expect(newCount.size_bytes).toBe(1000);
        });

        it('should increment existing record count', async () => {
            const connectionId = rnd.number();
            const environmentId = rnd.number();
            const model = rnd.string();

            let newCount = await Records.incrCount(db, {
                connectionId,
                environmentId,
                model,
                delta: 10,
                deltaSizeInBytes: 1000
            });
            expect(newCount.count).toBe(10);
            expect(newCount.size_bytes).toBe(1000);

            newCount = await Records.incrCount(db, {
                connectionId,
                environmentId,
                model,
                delta: 5,
                deltaSizeInBytes: 500
            });
            expect(newCount.count).toBe(15);
            expect(newCount.size_bytes).toBe(1500);

            newCount = await Records.incrCount(db, {
                connectionId,
                environmentId,
                model,
                delta: -3,
                deltaSizeInBytes: -200
            });
            expect(newCount.count).toBe(12);
            expect(newCount.size_bytes).toBe(1300);
        });

        it('should handle decrement', async () => {
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

            const initialStats = (await Records.getCountsByModel({ connectionId, environmentId })).unwrap();
            const initialCount = initialStats[model]?.count || 0;
            const initialSize = initialStats[model]?.size_bytes || 0;

            const newCount = await Records.incrCount(db, {
                connectionId,
                environmentId,
                model,
                delta: -2,
                deltaSizeInBytes: -200
            });

            expect(newCount.count).toBe(initialCount - 2);
            expect(newCount.size_bytes).toBe(initialSize - 200);
        });

        it('should keep count and size unchanged when both delta and deltaSizeInBytes are zero', async () => {
            const connectionId = rnd.number();
            const environmentId = rnd.number();
            const model = rnd.string();
            const syncId = uuid.v4();

            const records = [{ id: '1', name: 'John Doe' }];
            await upsertRecords({ records, connectionId, environmentId, model, syncId });

            const initialStats = (await Records.getCountsByModel({ connectionId, environmentId })).unwrap();

            const newCount = await Records.incrCount(db, {
                connectionId,
                environmentId,
                model,
                delta: 0,
                deltaSizeInBytes: 0
            });
            expect(newCount.count).toBe(initialStats[model]?.count);
            expect(newCount.size_bytes).toBe(initialStats[model]?.size_bytes);
        });
    });

    describe('autoPruningCandidate', () => {
        beforeEach(async () => {
            await db(RECORDS_TABLE).truncate();
        });
        it('should find a stale record candidate for pruning', async () => {
            const connectionId = rnd.number();
            const environmentId = rnd.number();
            const model = rnd.string();
            const syncId = uuid.v4();

            const records = [
                { id: '1', name: 'Old Record 1' },
                { id: '2', name: 'Old Record 2' }
            ];
            await upsertRecords({ records, connectionId, environmentId, model, syncId });

            // Make first record stale
            const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
            await db(RECORDS_TABLE).where({ external_id: '1', connection_id: connectionId, model }).update({ updated_at: oneDayAgo });

            // Try to find a stale record
            // Since we're picking a random partition, we might need to try multiple times
            const staleAfterMs = 60 * 60 * 1000; // 1 hour
            for (let i = 0; i < 1000; i++) {
                const candidate = (await Records.autoPruningCandidate({ staleAfterMs })).unwrap();
                if (candidate) {
                    expect(candidate.connectionId).toBe(connectionId);
                    expect(candidate.model).toBe(model);
                    const decodedCursor = Cursor.from(candidate.cursor);
                    if (!decodedCursor) {
                        throw new Error('Failed to decode cursor');
                    }
                    const staleRecord = (
                        await Records.getRecords({ connectionId: candidate.connectionId, model: candidate.model, externalIds: ['1'] })
                    ).unwrap().records[0];
                    expect(staleRecord?._nango_metadata.cursor).toBe(candidate.cursor);
                    return;
                }
            }
            throw new Error('No candidate found. Expecting one');
        });

        it('should return null when no stale records exist', async () => {
            const connectionId = rnd.number();
            const environmentId = rnd.number();
            const model = rnd.string();
            const syncId = uuid.v4();

            const records = [
                { id: '1', name: 'Old Record 1' },
                { id: '2', name: 'Old Record 2' }
            ];
            await upsertRecords({ records, connectionId, environmentId, model, syncId });

            // Since we're picking a random partition we need to try multiple times
            const staleAfterMs = 60 * 60 * 1000; // 1 hour
            for (let i = 0; i < 1000; i++) {
                const candidate = (await Records.autoPruningCandidate({ staleAfterMs })).unwrap();
                if (candidate) {
                    throw new Error(`Expected no candidate, but found ${JSON.stringify(candidate)}`);
                }
            }
        });

        it('should not return already pruned records', async () => {
            const connectionId = rnd.number();
            const environmentId = rnd.number();
            const model = rnd.string();
            const syncId = uuid.v4();

            // Insert records
            const records = [
                { id: '1', name: 'Record to be pruned' },
                { id: '2', name: 'Another record' }
            ];
            await upsertRecords({ records, connectionId, environmentId, model, syncId });

            // Mark the records as already pruned
            const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
            await db(RECORDS_TABLE).where({ connection_id: connectionId, model }).update({ updated_at: oneDayAgo, pruned_at: new Date() });

            // Try to find a stale record
            // Since we're picking a random partition we need to try multiple times
            const staleAfterMs = 60 * 60 * 1000; // 1 hour
            for (let i = 0; i < 50; i++) {
                const candidate = (await Records.autoPruningCandidate({ staleAfterMs })).unwrap();
                if (candidate) {
                    throw new Error(`Expected no candidate, but found ${JSON.stringify(candidate)}`);
                }
            }
        });
    });
});

async function upsertNRecords(n: number): Promise<{ environmentId: number; connectionId: number; model: string; syncId: string; result: UpsertSummary }> {
    const records = Array.from({ length: n }, (_, i) => ({ id: `${i}`, name: `record ${i}` }));
    const connectionId = rnd.number();
    const environmentId = rnd.number();
    const model = 'model-' + rnd.string();
    const syncId = uuid.v4();
    const result = await upsertRecords({ records, connectionId, environmentId, model, syncId });
    return {
        environmentId,
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
    environmentId,
    model,
    syncId,
    syncJobId = rnd.number(),
    merging = { strategy: 'override' }
}: {
    records: UnencryptedRecordData[];
    connectionId: number;
    environmentId: number;
    model: string;
    syncId: string;
    syncJobId?: number;
    merging?: MergingStrategy;
}) {
    const formatRes = formatRecords({ data: records, connectionId, model, syncId, syncJobId });
    if (formatRes.isErr()) {
        throw new Error(`Failed to format records: ${formatRes.error.message}`);
    }
    const updateRes = await Records.update({ records: formatRes.value, connectionId, environmentId, model, merging });
    if (updateRes.isErr()) {
        throw new Error(`Failed to update records: ${updateRes.error.message}`);
    }
    return updateRes.value;
}

const rnd = {
    number: () => Math.floor(Math.random() * 1000),
    string: () => Math.random().toString(36).substring(6)
};
