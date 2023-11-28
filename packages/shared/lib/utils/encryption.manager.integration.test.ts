import { expect, describe, it, beforeAll } from 'vitest';
import { multipleMigrations } from '../db/database.js';
import { generateInsertableJson, createRecords } from '../services/sync/data/mocks.js';
import type { DataRecord } from '../models/Sync.js';
import { upsert } from '../services/sync/data/data.service.js';

describe('Encryption manager tests', () => {
    beforeAll(async () => {
        await multipleMigrations();
    });

    it('Should be able to encrypt and insert 2000 records under 2 seconds', async () => {
        const environmentName = 'encrypt-records';

        const records = generateInsertableJson(2000);
        const { response, meta } = await createRecords(records, environmentName);
        const { response: formattedResults } = response;
        const { modelName, nangoConnectionId } = meta;
        const start = Date.now();

        const { error, success } = await upsert(
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
        const end = Date.now();
        const timeTaken = end - start;
        expect(timeTaken).toBeLessThan(2000);
    });
});
