import { Ok } from '@nangohq/utils';

import type { Orchestrator } from '../../../clients/orchestrator.js';
import type { CurrentFunctionConfig } from '../models/functions.js';
import type { DBConnection, DBFunctionInstance } from '@nangohq/types';
import type { Result } from '@nangohq/utils';

export async function scheduleInstances(
    orchestrator: Pick<Orchestrator, 'scheduleFunctions'>,
    targets: {
        instance: DBFunctionInstance;
        config: CurrentFunctionConfig;
        connection: Pick<DBConnection, 'id' | 'connection_id' | 'provider_config_key' | 'environment_id'>;
    }[]
): Promise<Result<void>> {
    const schedulable = targets.flatMap(({ instance, config, connection }) => {
        const trigger = config.currentVersion.trigger;
        if (!instance.enabled || !config.config.enabled || trigger.kind !== 'schedule') {
            return [];
        }
        return [{ environmentId: connection.environment_id, instance, functionUuid: config.config.uuid, connection, frequencyFallback: trigger.frequency }];
    });
    if (schedulable.length === 0) {
        return Ok(undefined);
    }
    return orchestrator.scheduleFunctions(schedulable);
}
