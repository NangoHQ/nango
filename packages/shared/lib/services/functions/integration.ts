import { Err, Ok } from '@nangohq/utils';

import * as functionConfigService from './models/functions.js';
import * as functionInstanceService from './models/instances.js';

import type { Orchestrator } from '../../clients/orchestrator.js';
import type { Result } from '@nangohq/utils';
import type { Knex } from 'knex';

export async function deleteForIntegration(
    db: Knex,
    {
        environmentId,
        integrationConfigId,
        orchestrator
    }: {
        environmentId: number;
        integrationConfigId: number;
        orchestrator: Pick<Orchestrator, 'deleteFunctionSchedules'>;
    }
): Promise<Result<void>> {
    try {
        const configs = await functionConfigService.rows(db, { environmentId, integrationId: integrationConfigId });
        if (configs.isErr()) {
            throw configs.error;
        }
        const configIds = configs.value.map((config) => config.id);

        let afterId = 0;
        while (true) {
            const instances = await functionInstanceService.search(db, { functionConfigIds: configIds }, { afterId, limit: 1000 });
            if (instances.isErr()) {
                throw instances.error;
            }
            if (instances.value.length === 0) {
                break;
            }

            const lastInstance = instances.value[instances.value.length - 1];
            if (!lastInstance) {
                break;
            }
            const instanceIds = instances.value.map((instance) => instance.id);
            const schedulesDeletion = await orchestrator.deleteFunctionSchedules({
                environmentId,
                instanceIds
            });
            if (schedulesDeletion.isErr()) {
                throw schedulesDeletion.error;
            }

            const deletedInstances = await functionInstanceService.softDelete(db, { instanceIds }, { environmentId });
            if (deletedInstances.isErr()) {
                throw deletedInstances.error;
            }

            afterId = lastInstance.id;
        }

        await db.transaction(async (trx) => {
            const deletedConfigs = await functionConfigService.softDelete(trx, { environmentId, ids: configIds });
            if (deletedConfigs.isErr()) {
                throw deletedConfigs.error;
            }
        });

        return Ok(undefined);
    } catch (err) {
        return Err(new Error('failed_to_delete_functions_for_integration', { cause: err }));
    }
}
