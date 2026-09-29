import db from '@nangohq/database';
import { Err, Ok } from '@nangohq/utils';

import connectionService from '../../connection.service.js';
import * as functionConfigService from '../models/functions.js';
import * as functionInstanceService from '../models/instances.js';

import type { Orchestrator } from '../../../clients/orchestrator.js';
import type { CurrentFunctionConfig } from '../models/functions.js';
import type { DBConnection, DBFunctionConfig } from '@nangohq/types';
import type { Result } from '@nangohq/utils';

/**
 * Idempotent: re-enabling an already enabled function re-runs provisioning so a retry repairs a partial first attempt.
 * Disabled variants are not restored.
 */
export async function enable({
    environmentId,
    config,
    orchestrator
}: {
    environmentId: number;
    config: CurrentFunctionConfig;
    orchestrator: Pick<Orchestrator, 'scheduleFunctions'>;
}): Promise<Result<DBFunctionConfig>> {
    try {
        const trigger = config.currentVersion.trigger;

        const updatedConfig = await db.knex.transaction(async (trx) => {
            const updated = await functionConfigService.update(trx, { environmentId, id: config.config.id, fields: { enabled: true } });
            if (updated.isErr()) {
                throw updated.error;
            }

            if (trigger.kind === 'schedule') {
                // Re-enable base variant instances that were disabled by a previous disable call.
                // Variants are not restored, we don't want to re-enable a variant that was explicitely disabled by the user.
                const reenabled = await functionInstanceService.setEnabled(
                    trx,
                    { functionConfigIds: [config.config.id] },
                    { environmentId, enabled: true, variant: 'base' }
                );
                if (reenabled.isErr()) {
                    throw reenabled.error;
                }
            }
            return updated.value;
        });

        if (trigger.kind !== 'schedule') {
            return Ok(updatedConfig);
        }

        const connections = await connectionService.getConnectionsByEnvironmentAndConfigId(db.knex, { environmentId, configId: config.integration.id });
        if (connections.isErr()) {
            throw connections.error;
        }

        const upserted = await functionInstanceService.upsert(
            db.knex,
            connections.value.map((connection) => ({
                function_config_id: config.config.id,
                nango_connection_id: connection.id,
                name: config.config.name,
                variant: 'base',
                frequency: null
            }))
        );
        if (upserted.isErr()) {
            throw upserted.error;
        }

        const connectionsById = new Map<number, Pick<DBConnection, 'id' | 'connection_id' | 'provider_config_key' | 'environment_id'>>(
            connections.value.map((connection) => [
                connection.id,
                {
                    id: connection.id,
                    connection_id: connection.connection_id,
                    provider_config_key: connection.provider_config_key,
                    environment_id: connection.environment_id
                }
            ])
        );
        let afterId = 0;
        while (true) {
            const instances = await functionInstanceService.search(db.knex, { functionConfigIds: [config.config.id] }, { enabled: true, afterId, limit: 1000 });
            if (instances.isErr()) {
                throw instances.error;
            }
            if (instances.value.length === 0) {
                break;
            }
            const scheduled = await orchestrator.scheduleFunctions(
                instances.value.flatMap((instance) => {
                    const connection = connectionsById.get(instance.nango_connection_id);
                    return connection
                        ? [{ environmentId, instance, connection, frequencyFallback: trigger.frequency, autoStart: trigger.autoStart ?? true }]
                        : [];
                })
            );
            if (scheduled.isErr()) {
                throw scheduled.error;
            }
            afterId = instances.value[instances.value.length - 1]!.id;
        }
        return Ok(updatedConfig);
    } catch (err) {
        return Err(new Error('failed_to_enable_function', { cause: err }));
    }
}

/**
 * Idempotent: disabling an already disabled function re-runs the teardown so a retry repairs a partial first attempt.
 * Every instance are disabled, including variants.
 */
export async function disable({
    environmentId,
    config,
    orchestrator
}: {
    environmentId: number;
    config: CurrentFunctionConfig;
    orchestrator: Pick<Orchestrator, 'deleteFunctionSchedules'>;
}): Promise<Result<DBFunctionConfig>> {
    try {
        const updatedConfig = await db.knex.transaction(async (trx) => {
            const updated = await functionConfigService.update(trx, { environmentId, id: config.config.id, fields: { enabled: false } });
            if (updated.isErr()) {
                throw updated.error;
            }

            const disabled = await functionInstanceService.setEnabled(trx, { functionConfigIds: [config.config.id] }, { environmentId, enabled: false });
            if (disabled.isErr()) {
                throw disabled.error;
            }

            if (disabled.value.length > 0) {
                const schedulesDeletion = await orchestrator.deleteFunctionSchedules({
                    environmentId,
                    instanceIds: disabled.value.map((instance) => instance.id)
                });
                if (schedulesDeletion.isErr()) {
                    throw schedulesDeletion.error;
                }
            }
            return updated.value;
        });
        return Ok(updatedConfig);
    } catch (err) {
        return Err(new Error('failed_to_disable_function', { cause: err }));
    }
}
