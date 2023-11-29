import { expect, describe, it, beforeAll } from 'vitest';
import dayjs from 'dayjs';
import { multipleMigrations } from '../../../db/database.js';
import * as DataService from './data.service.js';
import * as RecordsService from './records.service.js';
import { createConfigSeeds } from '../../../db/seeders/config.seeder.js';
import type { GetRecordsResponse, DataRecord } from '../../../models/Sync.js';
import type { ServiceResponse } from '../../../models/Generic.js';
import connectionService from '../../connection.service.js';
import { generateInsertableJson, createRecords } from './mocks.js';

const environmentName = 'records-service';

describe('Records service integration test', () => {
    beforeAll(async () => {
        await multipleMigrations();
        await createConfigSeeds(environmentName);
    });

    it('Should paginate the records to retrieve all records', async () => {
        const numOfRecords = 3000;
        const limit = 100;
        const records = generateInsertableJson(numOfRecords);
        const { response, meta } = await createRecords(records, environmentName);
        const { response: formattedResults } = response;
        const { modelName, nangoConnectionId } = meta;
        const connection = await connectionService.getConnectionById(nangoConnectionId as number);
        const { error, success } = await DataService.upsert(
            formattedResults as unknown as DataRecord[],
            '_nango_sync_data_records',
            'external_id',
            nangoConnectionId as number,
            modelName,
            1,
            1
        );
        expect(success).toBe(true);
        expect(error).toBe(undefined);

        let cursor = null;

        const allFetchedRecords = [];
        do {
            const result = (await RecordsService.getAllDataRecords(
                connection?.connection_id as string, // connectionId
                connection?.provider_config_key as string, // providerConfigKey
                connection?.environment_id as number, // environmentId
                modelName, // model
                undefined, // delta
                limit, // limit
                undefined, // filter
                cursor // cursor
            )) as unknown as ServiceResponse<GetRecordsResponse>;

            if (!result.response) {
                throw new Error('Response is undefined');
            }

            const { response: recordsResponse, error } = result;

            expect(error).toBe(null);
            expect(response).not.toBe(undefined);

            const { records, next_cursor } = recordsResponse;

            allFetchedRecords.push(...records);

            cursor = next_cursor;

            expect(records).not.toBe(undefined);
            expect(records?.length).toBeLessThanOrEqual(limit);
        } while (cursor);

        for (let i = 1; i < allFetchedRecords.length; i++) {
            // @ts-ignore
            const currentRecordDate = dayjs(allFetchedRecords[i]._nango_metadata.first_seen_at);
            // @ts-ignore
            const previousRecordDate = dayjs(allFetchedRecords[i - 1]._nango_metadata.first_seen_at);

            expect(currentRecordDate.isAfter(previousRecordDate) || currentRecordDate.isSame(previousRecordDate)).toBe(true);
        }
        expect(allFetchedRecords.length).toBe(numOfRecords);
    });

    it('Should be able to retrieve 20K records in under 5s with a cursor', async () => {
        const numOfRecords = 20000;
        const limit = 1000;
        const records = generateInsertableJson(numOfRecords);
        const { response, meta } = await createRecords(records, environmentName);
        const { response: formattedResults } = response;
        const { modelName, nangoConnectionId } = meta;

        // insert in chunks of 1000
        // @ts-ignore
        for (let i = 0; i < formattedResults?.length; i += 1000) {
            const { error, success } = await DataService.upsert(
                formattedResults?.slice(i, i + 1000) as unknown as DataRecord[],
                '_nango_sync_data_records',
                'external_id',
                nangoConnectionId as number,
                modelName,
                1,
                1
            );
            expect(success).toBe(true);
            expect(error).toBe(undefined);
        }

        const connection = await connectionService.getConnectionById(nangoConnectionId as number);

        let cursor: string | undefined | null = null;
        let allRecordsLength = 0;

        const startTime = Date.now();
        do {
            const { response, error } = (await RecordsService.getAllDataRecords(
                connection?.connection_id as string, // connectionId
                connection?.provider_config_key as string, // providerConfigKey
                connection?.environment_id as number, // environmentId
                modelName, // model
                undefined, // delta
                limit, // limit
                undefined, // filter
                cursor // cursor
            )) as unknown as ServiceResponse<GetRecordsResponse>;

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
