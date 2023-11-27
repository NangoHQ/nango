import { expect, describe, it, beforeAll } from 'vitest';
import { multipleMigrations } from '../../../db/database.js';
import * as DataService from './data.service.js';
import { formatDataRecords, getDataRecords } from './records.service.js';
import connectionService from '../../connection.service.js';
import { createConfigSeeds } from '../../../db/seeders/config.seeder.js';
import { createConnectionSeeds } from '../../../db/seeders/connection.seeder.js';
import { createSyncSeeds } from '../../../db/seeders/sync.seeder.js';
import { createSyncJobSeeds } from '../../../db/seeders/sync-job.seeder.js';
import { createActivityLogSeed } from '../../../db/seeders/activity.seeder.js';
import type { DataRecord, CustomerFacingDataRecord, DataRecordWithMetadata } from '../../../models/Sync.js';

describe('Data service integration tests', () => {
    beforeAll(async () => {
        await multipleMigrations();
        await createConfigSeeds();
    });

    it('Should insert records properly and retrieve', async () => {
        const connections = await createConnectionSeeds();

        const duplicateRecords = [
            {
                id: '1',
                name: 'John Doe'
            },
            {
                id: '1',
                name: 'John Doe'
            },
            {
                id: '2',
                name: 'Jane Doe'
            },
            {
                id: '2',
                name: 'Jane Doe'
            },
            {
                id: '3',
                name: 'John Doe'
            },
            {
                id: '3',
                name: 'John Doe'
            },
            { id: '4', name: 'Mike Doe' },
            { id: '5', name: 'Mike Doe' }
        ];
        const sync = await createSyncSeeds(connections[0]);
        const job = await createSyncJobSeeds(connections[0]);
        const activityLogId = await createActivityLogSeed(1);
        const modelName = Math.random().toString(36).substring(7);
        const { response: formattedResults } = formatDataRecords(duplicateRecords, connections[0] as number, modelName, sync.id as string, job.id as number);
        const { error, success } = await DataService.upsert(
            formattedResults as unknown as DataRecord[],
            '_nango_sync_data_records',
            'external_id',
            activityLogId,
            modelName,
            1,
            1
        );
        expect(success).toBe(true);
        expect(error).toBe(undefined);

        const expectedRecords = [
            { id: '5', name: 'Mike Doe' },
            { id: '4', name: 'Mike Doe' },
            { id: '3', name: 'John Doe' },
            { id: '2', name: 'Jane Doe' },
            { id: '1', name: 'John Doe' }
        ];

        const connection = await connectionService.getConnectionById(connections[0] as number);
        const { response } = await getDataRecords(
            connection?.connection_id as string,
            connection?.provider_config_key as string,
            1,
            modelName,
            '',
            undefined,
            100,
            'id',
            'desc'
        );
        const records = response?.result;
        expect(records?.length).toBe(5);

        for (let i = 0; i < (records as CustomerFacingDataRecord[])?.length; i++) {
            // @ts-ignore
            expect(records?.[i]?.id).toEqual(expectedRecords[i].id);
        }

        const { response: ascResponse } = await getDataRecords(
            connection?.connection_id as string,
            connection?.provider_config_key as string,
            connection?.environment_id as number,
            modelName,
            undefined, // delta
            undefined, // offset
            undefined, // limit
            'id', // sortBy
            'asc'
        );

        const ascRecords = ascResponse?.result;

        const reverseExpectedRecords = [...expectedRecords].reverse();
        for (let i = 0; i < (ascRecords as CustomerFacingDataRecord[])?.length; i++) {
            // @ts-ignore
            expect(ascRecords?.[i]?.id).toEqual(reverseExpectedRecords[i].id);
        }

        const { response: metaResponse } = await getDataRecords(
            connection?.connection_id as string,
            connection?.provider_config_key as string,
            1,
            modelName,
            undefined, // delta
            undefined, // offset
            undefined, // limit
            undefined, // sortBy
            undefined, // order
            undefined, // filter
            true // include metadata
        );

        const metaRecords = metaResponse?.result;

        for (const metaRecord of metaRecords as DataRecordWithMetadata[]) {
            expect(metaRecord).toHaveProperty('first_seen_at');
            expect(metaRecord).toHaveProperty('last_modified_at');

            expect(metaRecord.last_action).toBe('ADDED');
        }

        const { response: regularResponse } = await getDataRecords(
            connection?.connection_id as string,
            connection?.provider_config_key as string,
            1,
            modelName,
            undefined, // delta
            undefined, // offset
            undefined, // limit
            undefined, // sortBy
            undefined, // order
            undefined, // filter
            false // include metadata
        );

        const regularRecords = regularResponse?.result;

        for (const regularRecord of regularRecords as CustomerFacingDataRecord[]) {
            expect(regularRecord).toHaveProperty('_nango_metadata');
        }
    });
});
