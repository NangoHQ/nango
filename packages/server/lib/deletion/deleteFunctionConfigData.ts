import db from '@nangohq/database';
import { functionConfigService } from '@nangohq/shared';

import { tasks } from '../tasks/index.js';
import { deleteFunctionInstancesData } from './deleteFunctionInstancesData.js';

import type { BatchDeleteSharedOptions } from './batchDelete.js';
import type { DBFunctionConfig } from '@nangohq/types';

// Deletes a function config and all associated data, including function instances and artifacts.
export async function deleteFunctionConfigData(functionConfig: DBFunctionConfig, opts: BatchDeleteSharedOptions): Promise<void> {
    opts.logger.info('Deleting function config...', { functionConfigId: functionConfig.id, name: functionConfig.name });

    await deleteFunctionInstancesData({ environmentId: functionConfig.environment_id, filter: { functionConfigIds: [functionConfig.id] } }, opts);

    const fileLocations = await functionConfigService.getArtifactFileLocations(db.knex, {
        environmentId: functionConfig.environment_id,
        id: functionConfig.id
    });
    if (fileLocations.isErr()) {
        throw fileLocations.error;
    }
    if (fileLocations.value.length > 0) {
        const artifactDeletion = await tasks.enqueue('deleteFunctionArtifacts', {
            environmentId: functionConfig.environment_id,
            fileLocations: fileLocations.value
        });
        if (artifactDeletion.isErr()) {
            throw artifactDeletion.error;
        }
    }

    const configDeletion = await functionConfigService.hardDelete(db.knex, {
        environmentId: functionConfig.environment_id,
        ids: [functionConfig.id]
    });
    if (configDeletion.isErr()) {
        throw configDeletion.error;
    }
}
