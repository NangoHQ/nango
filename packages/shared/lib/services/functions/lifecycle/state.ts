import db from '@nangohq/database';
import { Err, Ok } from '@nangohq/utils';

import connectionService from '../../connection.service.js';
import * as functionConfigService from '../models/functions.js';
import * as functionInstanceService from '../models/instances.js';
import { scheduleInstances } from './schedule.js';

import type { Orchestrator } from '../../../clients/orchestrator.js';
import type { CurrentFunctionConfig } from '../models/functions.js';
import type { Result } from '@nangohq/utils';

/**
 * Idempotent: re-enabling an already enabled function re-runs provisioning so a retry repairs a partial first attempt.
 * Disabled variants are not restored.
 */
export async function enable({
    environmentId,
    uuid,
    orchestrator
}: {
    environmentId: number;
    uuid: string;
    orchestrator: Pick<Orchestrator, 'scheduleFunctions'>;
}): Promise<Result<CurrentFunctionConfig | undefined>> {
    try {
        const updatedConfig = await db.knex.transaction(async (trx) => {
            // Update before reading so the row lock prevents a concurrent deploy from changing the current version until commit.
            const updated = await functionConfigService.update(trx, { environmentId, uuid, fields: { enabled: true } });
            if (updated.isErr()) {
                throw updated.error;
            }
            if (!updated.value) {
                return undefined;
            }

            const current = await functionConfigService.search(trx, { environmentId, filter: { id: updated.value.id } });
            if (current.isErr()) {
                throw current.error;
            }
            const config = current.value[0];
            if (!config) {
                throw new Error('function_config_not_found', { cause: { environmentId, uuid } });
            }

            const trigger = config.currentVersion.trigger;
            if (trigger.kind !== 'schedule') {
                return config;
            }

            // Re-enable base instances only for auto-starting functions.
            // After disable(), autoStart:false instances must be started manually again; variants are not restored either.
            if (trigger.autoStart ?? true) {
                const reenabled = await functionInstanceService.setEnabled(
                    trx,
                    { functionConfigIds: [config.config.id] },
                    { environmentId, enabled: true, variant: 'base' }
                );
                if (reenabled.isErr()) {
                    throw reenabled.error;
                }
            }

            const connections = await connectionService.getConnectionsByEnvironmentAndConfigId(trx, { environmentId, configId: config.integration.id });
            if (connections.isErr()) {
                throw connections.error;
            }

            const upserted = await functionInstanceService.upsert(
                trx,
                connections.value.map((connection) => ({
                    function_config_id: config.config.id,
                    nango_connection_id: connection.id,
                    name: config.config.name,
                    variant: 'base',
                    frequency: null,
                    enabled: trigger.autoStart ?? true
                }))
            );
            if (upserted.isErr()) {
                throw upserted.error;
            }

            const connectionsById = new Map(
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
                const instances = await functionInstanceService.search(
                    trx,
                    { functionConfigIds: [config.config.id] },
                    { enabled: true, afterId, limit: 1000, forShare: true }
                );
                if (instances.isErr()) {
                    throw instances.error;
                }
                if (instances.value.length === 0) {
                    break;
                }
                const scheduled = await scheduleInstances(
                    orchestrator,
                    instances.value.flatMap((instance) => {
                        const connection = connectionsById.get(instance.nango_connection_id);
                        return connection ? [{ instance, config, connection }] : [];
                    })
                );
                if (scheduled.isErr()) {
                    throw scheduled.error;
                }
                afterId = instances.value[instances.value.length - 1]!.id;
            }
            return config;
        });
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
    uuid,
    orchestrator
}: {
    environmentId: number;
    uuid: string;
    orchestrator: Pick<Orchestrator, 'deleteFunctionSchedules'>;
}): Promise<Result<CurrentFunctionConfig | undefined>> {
    try {
        const updatedConfig = await db.knex.transaction(async (trx) => {
            // Update before reading so the row lock prevents a concurrent deploy from changing the current version until commit.
            const updated = await functionConfigService.update(trx, { environmentId, uuid, fields: { enabled: false } });
            if (updated.isErr()) {
                throw updated.error;
            }
            if (!updated.value) {
                return undefined;
            }

            const current = await functionConfigService.search(trx, { environmentId, filter: { id: updated.value.id } });
            if (current.isErr()) {
                throw current.error;
            }
            const config = current.value[0];
            if (!config) {
                throw new Error('function_config_not_found', { cause: { environmentId, uuid } });
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
            return config;
        });
        return Ok(updatedConfig);
    } catch (err) {
        return Err(new Error('failed_to_disable_function', { cause: err }));
    }
}
