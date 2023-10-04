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

    it('Should be able to encrypt a thousand records under 1 minute', async () => {
        const environmentName = 'encrypt-records';

        const records = generateInsertableJson(1000);
        const { response, meta } = await createRecords(records, environmentName);
        const { response: formattedResults } = response;
        const { modelName, nangoConnectionId } = meta;

        // chunk the formatted results into 1000 chunks
        const chunkedResults = [];
        // @ts-ignore
        for (let i = 0; i < formattedResults?.length; i += 1000) {
            const chunk = formattedResults?.slice(i, i + 1000);
            chunkedResults.push(chunk);
            const { error, success } = await upsert(
                chunk as unknown as DataRecord[], // Changed this line to use the chunk
                '_nango_sync_data_records',
                'external_id',
                nangoConnectionId as number,
                modelName,
                1
            );

            expect(success).toBe(true);
            expect(error).toBe(undefined);
        }
        const keyBuffer = crypto.randomBytes(32);
        const key = keyBuffer.toString('base64');
        // @ts-ignore
        encryptionManager.key = key;

        // time how long this takes
        const start = Date.now();
        await encryptionManager.encryptAllDataRecords();
        const end = Date.now();
        const timeTaken = end - start;

        expect(timeTaken).toBeLessThan(60000);
    });
});
