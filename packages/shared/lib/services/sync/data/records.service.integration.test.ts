import { expect, describe, it, beforeAll } from 'vitest';
import dayjs from 'dayjs';
import { multipleMigrations } from '../../../db/database.js';
import * as DataService from './data.service.js';
import * as RecordsService from './records.service.js';
import { createConfigSeeds } from '../../../db/seeders/config.seeder.js';
import type { DataRecord } from '../../../models/Sync.js';
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

        let cursor: string | undefined;

        const allFetchedRecords = [];
        do {
            const { response, error } = await RecordsService.getDataRecords(
                connection?.connection_id as string,
                connection?.provider_config_key as string,
                connection?.environment_id as number,
                modelName,
                undefined,
                '',
                limit,
                'desc',
                undefined,
                undefined,
                false,
                cursor
            );

            if (!response) {
                throw new Error('Response is undefined');
            }

            expect(error).toBe(null);
            expect(response).not.toBe(undefined);

            const { result: records, nextCursor } = response;

            allFetchedRecords.push(...records);

            cursor = nextCursor;

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

    it('Should not provide a cursor if offset is provided', async () => {
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

        const { response: recordResponse } = await RecordsService.getDataRecords(
            connection?.connection_id as string,
            connection?.provider_config_key as string,
            connection?.environment_id as number,
            modelName,
            undefined,
            100,
            limit,
            'desc',
            undefined,
            undefined,
            false
        );

        if (recordResponse) {
            const { nextCursor } = recordResponse;
            expect(nextCursor).toBe(undefined);
        }
    });
});
