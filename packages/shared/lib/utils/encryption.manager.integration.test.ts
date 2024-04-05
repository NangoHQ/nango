import { expect, describe, it, beforeAll } from 'vitest';
import { multipleMigrations } from '../db/database.js';
import { generateInsertableJson, createRecords } from '../services/sync/data/mocks.js';
import type { DataRecord } from '../models/Sync.js';
import * as DataService from '../services/sync/data/data.service.js';
import { LogContext } from '@nangohq/logs';

describe('Encryption manager tests', () => {
    beforeAll(async () => {
        await multipleMigrations();
    });

    it('Should be able to encrypt and insert 2000 records under 2 seconds', async () => {
        const records = generateInsertableJson(2000);
        const { response, meta } = await createRecords(records);
        const { response: formattedResults } = response;
        const { modelName, nangoConnectionId, env } = meta;
        const start = Date.now();

        const logCtx = new LogContext({ parentId: '1' }, { dryRun: true, logToConsole: false });
        const { error, success } = await DataService.upsert(
            formattedResults as unknown as DataRecord[],
            nangoConnectionId,
            modelName,
            1,
            env.id,
            undefined,
            logCtx
        );

        expect(success).toBe(true);
        expect(error).toBe(undefined);
        const end = Date.now();
        const timeTaken = end - start;
        expect(timeTaken).toBeLessThan(2000);
    });
});
