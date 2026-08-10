import { beforeAll, describe, expect, it } from 'vitest';

import db, { multipleMigrations } from '@nangohq/database';

import { createAccount } from '../../../seeders/account.seeder.js';
import { createConfigSeed } from '../../../seeders/config.seeder.js';
import { createEnvironmentSeed } from '../../../seeders/environment.seeder.js';
import { search, upsert } from './functions.js';

import type { DBFunctionConfigVersion } from '@nangohq/types';

function functionVersion(version: string): Omit<DBFunctionConfigVersion, 'id' | 'function_config_id' | 'created_at' | 'updated_at' | 'deleted_at'> {
    return {
        description: `Function ${version}`,
        file_location: `functions/${version}`,
        version,
        source: 'repo',
        trigger: { kind: 'none' },
        requires: { connection: true, outbound: false, invoke: false },
        capabilities: { usesRecords: false, usesOutbound: false, usesCheckpoints: false, usesMetadata: false, usesInvoke: false },
        limits: { concurrency: { perConnection: 'max' } },
        input_schema_ref: null,
        output_schema_ref: null,
        model_schema_refs: [],
        metadata_schema_ref: null,
        checkpoint_schema_ref: null,
        json_schema: { type: 'object' }
    };
}

describe(search, () => {
    beforeAll(async () => {
        await multipleMigrations();
    });

    it('filters functions by integration unique key', async () => {
        const account = await createAccount();
        const environment = await createEnvironmentSeed(account.id);
        const firstIntegration = await createConfigSeed(environment, 'github-first', 'github');
        const secondIntegration = await createConfigSeed(environment, 'github-second', 'github');

        await upsert(db.knex, {
            environmentId: environment.id,
            integrationId: firstIntegration.unique_key,
            name: 'firstFunction',
            version: functionVersion('first-version')
        });
        await upsert(db.knex, {
            environmentId: environment.id,
            integrationId: secondIntegration.unique_key,
            name: 'secondFunction',
            version: functionVersion('second-version')
        });

        const functions = (await search(db.knex, { environmentId: environment.id, integrationKey: firstIntegration.unique_key })).unwrap();

        expect(functions).toHaveLength(1);
        expect(functions[0]).toMatchObject({
            integration: { id: firstIntegration.id, unique_key: firstIntegration.unique_key },
            config: { nango_config_id: firstIntegration.id, name: 'firstFunction' },
            currentVersion: { version: 'first-version' }
        });
    });

    it('returns no functions for an unknown integration unique key', async () => {
        const account = await createAccount();
        const environment = await createEnvironmentSeed(account.id);
        const integration = await createConfigSeed(environment, 'github', 'github');
        await upsert(db.knex, {
            environmentId: environment.id,
            integrationId: integration.unique_key,
            name: 'function',
            version: functionVersion('version')
        });

        const functions = (await search(db.knex, { environmentId: environment.id, integrationKey: 'unknown' })).unwrap();

        expect(functions).toStrictEqual([]);
    });
});
