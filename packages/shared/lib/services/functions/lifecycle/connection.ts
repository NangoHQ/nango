import { Err, Ok } from '@nangohq/utils';

import * as functionConfigService from '../models/functions.js';
import * as functionInstanceService from '../models/instances.js';

import type { Orchestrator } from '../../../clients/orchestrator.js';
import type { CurrentFunctionConfig } from '../models/functions.js';
import type { DBConnection, DBFunctionConfigVersion, DBFunctionInstance, FunctionTriggerDefinition } from '@nangohq/types';
import type { Result } from '@nangohq/utils';
import type { Knex } from 'knex';

type FunctionConnection = Pick<DBConnection, 'id' | 'connection_id' | 'provider_config_key' | 'environment_id'>;

export async function ensureForConnection(
    trx: Knex,
    {
        connection,
        orchestrator
    }: {
        connection: FunctionConnection;
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
            (
                func
            ): func is CurrentFunctionConfig & {
                currentVersion: DBFunctionConfigVersion & { trigger: Extract<FunctionTriggerDefinition, { kind: 'schedule' }> };
            } => func.currentVersion.trigger.kind === 'schedule'
        );
        if (scheduled.length === 0) {
            return Ok(undefined);
        }

        const instances = await functionInstanceService.upsert(
            trx,
            scheduled.map(({ config }) => ({
                function_config_id: config.id,
                nango_connection_id: connection.id,
                name: config.name,
                variant: 'base',
                frequency: null
            }))
        );
        if (instances.isErr()) {
            return Err(instances.error);
        }

        const functionsByConfigId = new Map(scheduled.map((func) => [func.config.id, func]));
        return await orchestrator.scheduleFunctions(
            instances.value.flatMap((instance) => {
                if (!instance.enabled) {
                    return [];
                }
                const func = functionsByConfigId.get(instance.function_config_id);
                if (!func) {
                    return [];
                }
                return [
                    {
                        environmentId: connection.environment_id,
                        instance,
                        functionUuid: func.config.uuid,
                        connection,
                        frequencyFallback: func.currentVersion.trigger.frequency,
                        autoStart: func.currentVersion.trigger.autoStart ?? true
                    }
                ];
            })
        );
    } catch (err) {
        return Err(new Error('failed_to_ensure_function_instances', { cause: err }));
    }
}

export async function softDeleteInstancesForConnection(
    trx: Knex,
    { connection }: { connection: Pick<FunctionConnection, 'id' | 'environment_id'> }
): Promise<Result<DBFunctionInstance[]>> {
    try {
        return await functionInstanceService.softDelete(trx, { connectionIds: [connection.id] }, { environmentId: connection.environment_id });
    } catch (err) {
        return Err(new Error('failed_to_soft_delete_function_instances_for_connection', { cause: err }));
    }
}
