import db from '@nangohq/database';
import { Err, Ok } from '@nangohq/utils';

import * as functionConfigService from './models/functions.js';
import * as functionInstanceService from './models/instances.js';

import type { Orchestrator } from '../../clients/orchestrator.js';
import type { DBConnection } from '@nangohq/types';
import type { Result } from '@nangohq/utils';

type FunctionConnection = Pick<DBConnection, 'id' | 'connection_id' | 'provider_config_key' | 'environment_id'>;

export async function ensureForConnection({
    connection,
    orchestrator
}: {
    connection: FunctionConnection;
    orchestrator: Pick<Orchestrator, 'scheduleFunctions'>;
}): Promise<Result<void>> {
    try {
        const configs = await functionConfigService.search(db.knex, {
            environmentId: connection.environment_id,
            filter: { integrationKey: connection.provider_config_key, enabled: true }
        });
        if (configs.isErr()) {
            return Err(configs.error);
        }

        const scheduled = configs.value.flatMap((config) => {
            const trigger = config.currentVersion.trigger;
            return trigger.kind === 'schedule' ? [{ config: config.config, trigger }] : [];
        });
        if (scheduled.length === 0) {
            return Ok(undefined);
        }

        const instances = await functionInstanceService.upsert(
            db.knex,
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

        const triggerByConfigId = new Map(scheduled.map(({ config, trigger }) => [config.id, trigger]));
        return await orchestrator.scheduleFunctions(
            instances.value.flatMap((instance) => {
                const trigger = triggerByConfigId.get(instance.function_config_id);
                return trigger
                    ? [
                          {
                              environmentId: connection.environment_id,
                              instance,
                              connection,
                              frequencyFallback: trigger.frequency,
                              autoStart: trigger.autoStart ?? true
                          }
                      ]
                    : [];
            })
        );
    } catch (err) {
        return Err(new Error('failed_to_ensure_function_instances', { cause: err }));
    }
}
