import { expect, describe, it, beforeAll, afterAll } from 'vitest';
import { multipleMigrations } from '../../db/database.js';
import * as DataService from './data.service.js';
import { formatDataRecords } from './data-records.service.js';
import { create as createConfigs, deleteAll as deleteConfigs } from '../../db/seeders/config.seeder.js';
import { create as createConnections, deleteAll as deleteConnections } from '../../db/seeders/connection.seeder.js';
import { create as createSync, deleteAll as deleteSyncs } from '../../db/seeders/sync.seeder.js';
import { create as createSyncJob, deleteAll as deleteSyncJobs } from '../../db/seeders/sync-job.seeder.js';
import type { DataRecord } from '../../models/Sync.js';

describe('Data service integration tests', () => {
    beforeAll(async () => {
        await multipleMigrations();
        await createConfigs();
        await createConnections();
    });

    it('Should insert records properly', async () => {
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
        const sync = await createSync();
        const job = await createSyncJob();
        // TODO make this dynamic if tests are re-run
        const { response: formattedResults } = formatDataRecords(duplicateRecords, 1, 'test', sync.id as string, 1);
        const { error, success } = await DataService.upsert(
            formattedResults as unknown as DataRecord[],
            '_nango_sync_data_records',
            'external_id',
            1,
            'test',
            job.id as number
        );
        expect(success).toBe(true);
        expect(error).toBe(undefined);
    });

    afterAll(async () => {
        await deleteConnections();
        await deleteConfigs();
        await deleteSyncs();
        await deleteSyncJobs();
    });
});
