import { expect, describe, it, beforeAll } from 'vitest';
import dayjs from 'dayjs';
import { multipleMigrations } from '../../../db/database.js';
import * as RecordsService from './records.service.js';
import { createConfigSeeds } from '../../../db/seeders/config.seeder.js';
import { upsertRecords } from './mocks.js';

const environmentName = 'records-service';

describe('Records service', () => {
    beforeAll(async () => {
        await multipleMigrations();
        await createConfigSeeds(environmentName);
    });

    it('Should retrieve records', async () => {
        const n = 10;
        const { connection, model } = await upsertRecords(n);
        const { success, response, error } = await RecordsService.getAllDataRecords(
            connection.connection_id,
            connection.provider_config_key,
            connection.environment_id,
            model
        );
        expect(success).toBe(true);
        expect(error).toBe(null);
        expect(response?.records.length).toBe(n);
        expect(response?.records[0]?.['_nango_metadata']).toMatchObject({
            first_seen_at: expect.toBeIsoDateTimezone(),
            last_modified_at: expect.toBeIsoDateTimezone(),
            last_action: 'ADDED',
            deleted_at: null,
            cursor: expect.stringMatching(/^[A-Za-z0-9+/]+={0,2}$/) // base64 encoded string
        });
        expect(response?.next_cursor).toBe(null); // no next page
    });

    it('Should paginate the records to retrieve all records', async () => {
        const numOfRecords = 3000;
        const limit = 100;
        const { connection, model } = await upsertRecords(numOfRecords);

        let cursor = null;
        const allFetchedRecords = [];
        do {
            const result = await RecordsService.getAllDataRecords(
                connection.connection_id,
                connection.provider_config_key,
                connection.environment_id,
                model,
                undefined, // delta
                limit, // limit
                undefined, // filter
                cursor // cursor
            );

            if (!result.response) {
                throw new Error('Response is undefined');
            }

            const { response: recordsResponse, error } = result;

            expect(error).toBe(null);
            expect(recordsResponse).not.toBe(undefined);

            const { records, next_cursor } = recordsResponse;

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
        const { connection, model } = await upsertRecords(numOfRecords);

        let cursor: string | undefined | null = null;
        let allRecordsLength = 0;

        const startTime = Date.now();
        do {
            const { response, error } = await RecordsService.getAllDataRecords(
                connection.connection_id,
                connection.provider_config_key,
                connection.environment_id,
                model, // model
                undefined, // delta
                limit, // limit
                undefined, // filter
                cursor // cursor
            );

            if (!response) {
                throw new Error('Response is undefined');
            }

            expect(error).toBe(null);
            expect(response).not.toBe(undefined);

            const { records, next_cursor } = response;

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
