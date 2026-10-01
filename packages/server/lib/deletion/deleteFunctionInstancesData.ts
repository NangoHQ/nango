import db from '@nangohq/database';
import { functionInstanceService } from '@nangohq/shared';

import { getOrchestrator } from '../utils/utils.js';
import { batchDelete } from './batchDelete.js';

import type { BatchDeleteSharedOptions } from './batchDelete.js';
import type { FunctionInstanceFilter } from '@nangohq/shared';

const orchestrator = getOrchestrator();
const BATCH_SIZE = 1000;

//Deletes function instances and their external schedules in batches.
export async function deleteFunctionInstancesData(
    { environmentId, filter }: { environmentId: number; filter: FunctionInstanceFilter },
    opts: BatchDeleteSharedOptions
): Promise<void> {
    const limit = Math.min(opts.limit, BATCH_SIZE);

    await batchDelete({
        ...opts,
        name: 'function instances',
        limit,
        deleteFn: async () => {
            const instances = await functionInstanceService.search(db.knex, filter, { includeDeleted: true, limit });
            if (instances.isErr()) {
                throw instances.error;
            }
            if (instances.value.length === 0) {
                return 0;
            }

            const instanceIds = instances.value.map((instance) => instance.id);
            const schedulesDeletion = await orchestrator.deleteFunctionSchedules({ environmentId, instanceIds });
            if (schedulesDeletion.isErr()) {
                throw schedulesDeletion.error;
            }

            const instancesDeletion = await functionInstanceService.hardDelete(db.knex, { instanceIds }, { environmentId });
            if (instancesDeletion.isErr()) {
                throw instancesDeletion.error;
            }
            if (instancesDeletion.value.length !== instances.value.length) {
                throw new Error('failed_to_hard_delete_all_function_instances');
            }

            return instancesDeletion.value.length;
        }
    });
}
