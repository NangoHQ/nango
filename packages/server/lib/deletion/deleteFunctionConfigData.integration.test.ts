import { beforeAll, describe, expect, it, vi } from 'vitest';

import db, { multipleMigrations } from '@nangohq/database';
import { functionConfigService, seeders } from '@nangohq/shared';
import { getLogger, Ok } from '@nangohq/utils';

import { tasks } from '../tasks/index.js';
import { deleteFunctionConfigData } from './deleteFunctionConfigData.js';

import type * as serverUtils from '../utils/utils.js';
import type { BatchDeleteSharedOptions } from './batchDelete.js';
import type { DBFunctionConfigVersion } from '@nangohq/types';

vi.mock('../utils/utils.js', async (importOriginal) => {
    const actual = await importOriginal<typeof serverUtils>();
    return {
        ...actual,
        getOrchestrator: () => ({ deleteFunctionSchedules: () => Promise.resolve(Ok(undefined)) })
    };
});

const logger = getLogger('test.deletion');
const opts: BatchDeleteSharedOptions = { deadline: new Date(Date.now() + 60_000), limit: 100, logger, sleepMs: 0 };

function functionVersion(version: string): Omit<DBFunctionConfigVersion, 'id' | 'function_config_id' | 'created_at' | 'updated_at' | 'deleted_at'> {
    return {
        description: `Function ${version}`,
        file_location: `dev/functions/test/${version}.js`,
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

describe(deleteFunctionConfigData, () => {
    beforeAll(async () => {
        await multipleMigrations();
    });

    it('enqueues every version file location before deleting versions', async () => {
        const environment = await seeders.createEnvironmentSeed();
        const integration = await seeders.createConfigSeed(environment, 'github-functions', 'github');

        const [created] = (
            await functionConfigService.upsert(db.knex, [
                {
                    environmentId: environment.id,
                    integrationId: integration.unique_key,
                    name: 'testFunction',
                    version: functionVersion('version-one')
                }
            ])
        ).unwrap();
        if (!created) {
            throw new Error('failed_to_create_function_config');
        }
        await functionConfigService.upsert(db.knex, [
            {
                environmentId: environment.id,
                integrationId: integration.unique_key,
                name: 'testFunction',
                version: functionVersion('version-two')
            }
        ]);
        await functionConfigService.softDelete(db.knex, { environmentId: environment.id, ids: [created.config.id] });

        const enqueue = vi.spyOn(tasks, 'enqueue').mockImplementation(async () => {
            expect(await db.knex('function_config_versions').where({ function_config_id: created.config.id })).toHaveLength(2);
            return Ok({ taskId: 'delete-artifacts-task' });
        });

        await deleteFunctionConfigData(created.config, opts);

        expect(enqueue).toHaveBeenCalledWith('deleteFunctionArtifacts', {
            environmentId: environment.id,
            fileLocations: ['dev/functions/test/version-one.js', 'dev/functions/test/version-two.js']
        });
        expect(await db.knex('function_config_versions').where({ function_config_id: created.config.id })).toHaveLength(0);
        expect(await db.knex('function_configs').where({ id: created.config.id })).toHaveLength(0);
    });
});
