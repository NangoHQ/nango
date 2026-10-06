import db from '@nangohq/database';
import { Err, getFrequencyMs, MIN_SYNC_FREQUENCY_MS, Ok } from '@nangohq/utils';

import connectionService from '../../connection.service.js';
import * as functionConfigService from '../models/functions.js';
import * as functionInstanceService from '../models/instances.js';
import { scheduleInstances } from './schedule.js';

import type { Orchestrator } from '../../../clients/orchestrator.js';
import type { DBConnection, FunctionTriggerDefinition, FunctionVariantErrorCode, PatchFunctionVariant, PostFunctionVariant } from '@nangohq/types';
import type { Result } from '@nangohq/utils';
import type { Knex } from 'knex';

export class FunctionVariantError extends Error {
    constructor(
        readonly code: FunctionVariantErrorCode,
        readonly status: 400 | 404 | 409 | 500,
        message: string,
        cause?: unknown
    ) {
        super(message, { cause });
    }
}

type VariantArgs = {
    environmentId: number;
    connectionId: string;
    functionUuid: string;
    variant: string;
};

type ValidatedVariantArgs = {
    validated: functionConfigService.CurrentFunctionConfig & {
        currentVersion: { trigger: Extract<FunctionTriggerDefinition, { kind: 'schedule' }> };
    };
    connection: DBConnection;
};

export async function createVariant({
    orchestrator,
    maxVariants,
    ...args
}: VariantArgs & { maxVariants: number; orchestrator: Pick<Orchestrator, 'scheduleFunctions'> }): Promise<
    Result<PostFunctionVariant['Success'], FunctionVariantError>
> {
    try {
        let { validated, instance } = await db.knex.transaction(async (trx) => {
            const locked = await functionInstanceService.lockFunctionInstance(trx, args);
            if (locked.isErr()) {
                throw locked.error;
            }
            const validation = await validateArgs(trx, args);
            if (validation.isErr()) {
                throw validation.error;
            }
            const { validated, connection } = validation.value;
            if (!validated.config.enabled) {
                throw new FunctionVariantError('function_disabled', 400, `Function '${args.functionUuid}' is disabled`);
            }
            const instances = await functionInstanceService.search(trx, { connectionIds: [connection.id] });
            if (instances.isErr()) {
                throw instances.error;
            }
            const variants = instances.value.filter((instance) => instance.function_config_id === validated.config.id);
            const existing = variants.find((instance) => instance.variant === args.variant);
            if (existing) {
                return { validated, connection, instance: existing };
            }
            if (variants.length >= maxVariants) {
                throw new FunctionVariantError('resource_capped', 400, `Maximum number of variants per function (${maxVariants}) reached`);
            }
            const created = await functionInstanceService.upsert(trx, [
                {
                    nango_connection_id: connection.id,
                    function_config_id: validated.config.id,
                    name: validated.config.name,
                    variant: args.variant,
                    frequency: null,
                    enabled: validated.currentVersion.trigger.autoStart ?? true
                }
            ]);
            if (created.isErr()) {
                throw created.error;
            }
            const instance = created.value[0];
            if (!instance) {
                throw new Error('failed_to_create_function_variant');
            }
            return { validated, connection, instance };
        });
        if (instance.enabled) {
            const instanceId = instance.id;
            ({ validated, instance } = await db.knex.transaction(async (trx) => {
                // Variant update or deletion may have run right after the instance committed.
                // We re-lock the function and re-validate the args to ensure the variant still exists and is enabled before scheduling.
                const locked = await functionInstanceService.lockFunctionInstance(trx, args);
                if (locked.isErr()) {
                    throw locked.error;
                }
                const validation = await validateArgs(trx, args);
                if (validation.isErr()) {
                    throw validation.error;
                }
                const { validated, connection } = validation.value;
                const current = await functionInstanceService.search(trx, { instanceIds: [instanceId] }, { forShare: true });
                if (current.isErr()) {
                    throw current.error;
                }
                const freshInstance = current.value[0];
                if (!freshInstance) {
                    throw new FunctionVariantError('function_variant_not_found', 404, `Variant '${args.variant}' was deleted before scheduling`);
                }
                const scheduled = await scheduleInstances(orchestrator, [{ instance: freshInstance, config: validated, connection }]);
                if (scheduled.isErr()) {
                    throw scheduled.error;
                }
                return { validated, instance: freshInstance };
            }));
        }
        return Ok({
            function: { uuid: validated.config.uuid, name: validated.config.name },
            variant: instance.variant,
            frequency: instance.frequency || validated.currentVersion.trigger.frequency,
            state: instance.enabled ? 'enabled' : 'disabled'
        });
    } catch (err) {
        return Err(err instanceof FunctionVariantError ? err : new FunctionVariantError('server_error', 500, 'Failed to create function variant', err));
    }
}

export async function deleteVariant({
    orchestrator,
    ...args
}: VariantArgs & { orchestrator: Pick<Orchestrator, 'deleteFunctionSchedules'> }): Promise<Result<void, FunctionVariantError>> {
    try {
        await db.knex.transaction(async (trx) => {
            const locked = await functionInstanceService.lockFunctionInstance(trx, args);
            if (locked.isErr()) {
                throw locked.error;
            }
            const validation = await validateArgs(trx, args);
            if (validation.isErr()) {
                throw validation.error;
            }
            const { validated, connection } = validation.value;
            const instances = await functionInstanceService.search(trx, { connectionIds: [connection.id] });
            if (instances.isErr()) {
                throw instances.error;
            }
            const existing = instances.value.find((instance) => instance.function_config_id === validated.config.id && instance.variant === args.variant);
            if (!existing) {
                throw new FunctionVariantError('function_variant_not_found', 404, `Variant '${args.variant}' was not found`);
            }
            const deleted = await functionInstanceService.softDelete(trx, { instanceIds: [existing.id] }, { environmentId: args.environmentId });
            if (deleted.isErr()) {
                throw deleted.error;
            }
            const unscheduled = await orchestrator.deleteFunctionSchedules({ environmentId: args.environmentId, instanceIds: [existing.id] });
            if (unscheduled.isErr()) {
                throw unscheduled.error;
            }
        });
        return Ok(undefined);
    } catch (err) {
        return Err(err instanceof FunctionVariantError ? err : new FunctionVariantError('server_error', 500, 'Failed to delete function variant', err));
    }
}

export async function updateVariant(
    orchestrator: Pick<Orchestrator, 'scheduleFunctions' | 'deleteFunctionSchedules'>,
    args: VariantArgs & { enabled?: boolean | undefined; frequency?: string | null | undefined }
): Promise<Result<PatchFunctionVariant['Success'], FunctionVariantError>> {
    try {
        const frequencyValidation = validateFrequency(args.frequency);
        if (frequencyValidation.isErr()) {
            throw frequencyValidation.error;
        }

        let { validated, instance } = await db.knex.transaction(async (trx) => {
            const locked = await functionInstanceService.lockFunctionInstance(trx, args);
            if (locked.isErr()) {
                throw locked.error;
            }
            const validation = await validateArgs(trx, args);
            if (validation.isErr()) {
                throw validation.error;
            }
            const { validated, connection } = validation.value;

            if (args.enabled === true && !validated.config.enabled) {
                throw new FunctionVariantError('function_disabled', 400, `Function '${args.functionUuid}' is disabled`);
            }

            const updated = await functionInstanceService.update(trx, {
                connectionId: connection.id,
                functionConfigId: validated.config.id,
                variant: args.variant,
                enabled: args.enabled,
                frequency: frequencyValidation.value
            });
            if (updated.isErr()) {
                throw updated.error;
            }
            if (!updated.value) {
                throw new FunctionVariantError('function_variant_not_found', 404, `Variant '${args.variant}' was not found`);
            }

            // Delete before committing so a failed deletion leaves the instance discoverable for retry.
            if (!updated.value.enabled || !validated.config.enabled) {
                const unscheduled = await orchestrator.deleteFunctionSchedules({ environmentId: args.environmentId, instanceIds: [updated.value.id] });
                if (unscheduled.isErr()) {
                    throw unscheduled.error;
                }
            }

            return { validated, instance: updated.value };
        });
        if (instance.enabled && validated.config.enabled) {
            const instanceId = instance.id;
            // Commit the enabled state and frequency before scheduling. A scheduling failure leaves
            // a committed instance that PATCH can retry, rather than a schedule for rolled-back state.
            ({ validated, instance } = await db.knex.transaction(async (trx) => {
                const locked = await functionInstanceService.lockFunctionInstance(trx, args);
                if (locked.isErr()) {
                    throw locked.error;
                }
                const validation = await validateArgs(trx, args);
                if (validation.isErr()) {
                    throw validation.error;
                }
                const { validated, connection } = validation.value;
                const current = await functionInstanceService.search(trx, { instanceIds: [instanceId] }, { forShare: true });
                if (current.isErr()) {
                    throw current.error;
                }
                const freshInstance = current.value[0];
                if (!freshInstance) {
                    throw new FunctionVariantError('function_variant_not_found', 404, `Variant '${args.variant}' was deleted before scheduling`);
                }
                const scheduled = await scheduleInstances(orchestrator, [{ instance: freshInstance, config: validated, connection }]);
                if (scheduled.isErr()) {
                    throw scheduled.error;
                }
                return { validated, instance: freshInstance };
            }));
        }
        return Ok({
            function: { uuid: validated.config.uuid, name: validated.config.name },
            variant: instance.variant,
            state: instance.enabled ? 'enabled' : 'disabled',
            frequency: instance.frequency || validated.currentVersion.trigger.frequency
        });
    } catch (err) {
        return Err(err instanceof FunctionVariantError ? err : new FunctionVariantError('server_error', 500, 'Failed to update function variant', err));
    }
}

async function validateArgs(trx: Knex, { environmentId, connectionId, functionUuid, variant }: VariantArgs): Promise<Result<ValidatedVariantArgs>> {
    try {
        if (variant.toLowerCase() === 'base') {
            return Err(new FunctionVariantError('invalid_variant', 400, `Variant name "${variant}" is protected.`));
        }
        const configs = await functionConfigService.search(trx, { environmentId, filter: { uuid: functionUuid } }, { forShare: true });
        if (configs.isErr()) {
            return Err(configs.error);
        }
        const func = configs.value[0];
        if (!func) {
            return Err(new FunctionVariantError('function_not_found', 404, `Function '${functionUuid}' was not found`));
        }
        const trigger = func.currentVersion.trigger;
        if (trigger.kind !== 'schedule') {
            return Err(new FunctionVariantError('invalid_variant', 400, 'Only scheduled functions support variants'));
        }
        const connection = await connectionService.checkIfConnectionExists(trx, {
            connectionId,
            providerConfigKey: func.integration.unique_key,
            environmentId
        });
        if (!connection) {
            return Err(new FunctionVariantError('connection_not_found', 404, `Connection '${connectionId}' was not found`));
        }
        return Ok({ validated: { ...func, currentVersion: { ...func.currentVersion, trigger } }, connection });
    } catch (err) {
        return Err(new Error('Failed to validate function variant', { cause: err }));
    }
}

function validateFrequency(frequency: string | null | undefined): Result<string | undefined | null> {
    if (frequency === undefined || frequency === null) {
        return Ok(frequency);
    }
    const res = getFrequencyMs(frequency);
    if (res.isErr() || res.value < MIN_SYNC_FREQUENCY_MS) {
        return Err(new FunctionVariantError('invalid_frequency', 400, 'Frequency is invalid'));
    }
    return Ok(frequency);
}
