import { Err, Ok } from '@nangohq/utils';

import * as functionConfigService from '../models/functions.js';
import * as functionInstanceService from '../models/instances.js';
import { scheduleInstances } from './schedule.js';

import type { Orchestrator } from '../../../clients/orchestrator.js';
import type { CurrentFunctionConfig } from '../models/functions.js';
import type { DBConnection, DBFunctionInstance, FunctionTriggerDefinition } from '@nangohq/types';
import type { Result } from '@nangohq/utils';
import type { Knex } from 'knex';

export async function ensureForConnection(
    trx: Knex,
    {
        connection,
        orchestrator
    }: {
        connection: Pick<DBConnection, 'id' | 'connection_id' | 'environment_id' | 'provider_config_key'>;
        orchestrator: Pick<Orchestrator, 'scheduleFunctions'>;
    }
): Promise<Result<void>> {
    try {
        const configs = await functionConfigService.search(
            trx,
            { environmentId: connection.environment_id, filter: { integrationKey: connection.provider_config_key, enabled: true } },
            { forShare: true }
        );
        if (configs.isErr()) {
            return Err(configs.error);
        }

        const scheduled = configs.value.filter(
            (func): func is CurrentFunctionConfig & { currentVersion: { trigger: Extract<FunctionTriggerDefinition, { kind: 'schedule' }> } } =>
                func.currentVersion.trigger.kind === 'schedule'
        );
        if (scheduled.length === 0) {
            return Ok(undefined);
        }

        const instances = await functionInstanceService.upsert(
            trx,
            scheduled.map(({ config, currentVersion }) => ({
                function_config_id: config.id,
                nango_connection_id: connection.id,
                name: config.name,
                variant: 'base',
                frequency: null,
                enabled: currentVersion.trigger.autoStart ?? true
            }))
        );
        if (instances.isErr()) {
            return Err(instances.error);
        }

        const configsById = new Map(scheduled.map((func) => [func.config.id, func]));
        return await scheduleInstances(
            orchestrator,
            instances.value.flatMap((instance) => {
                const config = configsById.get(instance.function_config_id);
                return config ? [{ instance, config, connection }] : [];
            })
        );
    } catch (err) {
        return Err(new Error('failed_to_ensure_function_instances', { cause: err }));
    }
}

export async function softDeleteInstancesForConnection(
    trx: Knex,
    { connection }: { connection: Pick<DBConnection, 'id' | 'environment_id'> }
): Promise<Result<DBFunctionInstance[]>> {
    try {
        return await functionInstanceService.softDelete(trx, { connectionIds: [connection.id] }, { environmentId: connection.environment_id });
    } catch (err) {
        return Err(new Error('failed_to_soft_delete_function_instances_for_connection', { cause: err }));
    }
}
