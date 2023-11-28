import crypto from 'crypto';
import { expect, describe, it, beforeAll } from 'vitest';
import encryptionManager from './encryption.manager.js';
import { multipleMigrations } from '../db/database.js';
import { generateInsertableJson, createRecords } from '../services/sync/data/mocks.js';
import type { DataRecord } from '../models/Sync.js';
import { upsert } from '../services/sync/data/data.service.js';

describe('Encryption manager tests', () => {
    beforeAll(async () => {
        await multipleMigrations();
    });

    it('Should be able to encrypt 100 records under 2 seconds', async () => {
        const environmentName = 'encrypt-records';

        const records = generateInsertableJson(100);
        const { response, meta } = await createRecords(records, environmentName);
        const { response: formattedResults } = response;
        const { modelName, nangoConnectionId } = meta;
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
        const keyBuffer = crypto.randomBytes(32);
        const key = keyBuffer.toString('base64');
        // @ts-ignore
        encryptionManager.key = key;

        // time how long this takes
        const start = Date.now();
        await encryptionManager.encryptAllDataRecords();
        const end = Date.now();
        const timeTaken = end - start;

        expect(timeTaken).toBeLessThan(2000);
    });
});
