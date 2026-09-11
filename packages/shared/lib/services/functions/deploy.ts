import db from '@nangohq/database';
import { Err, Ok } from '@nangohq/utils';

import configService from '../config.service.js';
import connectionService from '../connection.service.js';
import remoteFileService from '../file/remote.service.js';
import * as functionConfigService from './models/functions.js';
import * as functionInstanceService from './models/instances.js';
import { reconcile } from './reconcile.js';
import { functionVersionHash } from './version.js';

import type { CurrentFunctionConfig } from './models/functions.js';
import type { FunctionInstanceUpsert } from './models/instances.js';
import type { DeploymentBundleReconciliation } from './reconcile.js';
import type { FunctionDeploymentArtifact, FunctionReconciliationScope } from '@nangohq/types';
import type { Result } from '@nangohq/utils';

export type DeploymentBundleError = Error & { code: 'functions_deployment_error' };
export type DeploymentBundlePreparationError = DeploymentBundleError | (Error & { code: 'integration_not_found'; integrationIds: string[] });

function functionsDeploymentError(cause: unknown): DeploymentBundleError {
    return Object.assign(new Error('functions_deployment_error', { cause }), { code: 'functions_deployment_error' as const });
}

function integrationNotFoundError(integrationIds: string[]): Error & { code: 'integration_not_found'; integrationIds: string[] } {
    return Object.assign(new Error('integration_not_found'), { code: 'integration_not_found' as const, integrationIds });
}

export async function prepareDeploymentBundle({
    functions,
    environmentId,
    reconciliationScope
}: {
    functions: FunctionDeploymentArtifact[];
    environmentId: number;
    reconciliationScope: FunctionReconciliationScope;
}): Promise<Result<DeploymentBundleReconciliation, DeploymentBundlePreparationError>> {
    try {
        if (reconciliationScope.kind === 'integration') {
            const mismatch = new Set(functions.map((fn) => fn.integrationId).filter((integrationId) => integrationId !== reconciliationScope.integrationId));
            if (mismatch.size > 0) {
                return Err(
                    functionsDeploymentError(
                        new Error('function_integration_scope_mismatch', {
                            cause: { integrationId: reconciliationScope.integrationId, mismatchedIntegrationIds: [...mismatch] }
                        })
                    )
                );
            }
        }

        const targetIntegrationIds = new Set(functions.map((fn) => fn.integrationId));
        if (reconciliationScope.kind === 'integration') {
            targetIntegrationIds.add(reconciliationScope.integrationId);
        }

        if (targetIntegrationIds.size > 0) {
            const integrations = await configService.listProviderConfigs(db.knex, environmentId);
            const integrationIds = new Set(integrations.map((integration) => integration.unique_key));
            const missingIntegrationIds = [...targetIntegrationIds].filter((integrationId) => !integrationIds.has(integrationId));
            if (missingIntegrationIds.length > 0) {
                return Err(integrationNotFoundError(missingIntegrationIds));
            }
        }

        const deployed = await functionConfigService.search(db.knex, {
            environmentId,
            filter: reconciliationScope.kind === 'integration' ? { integrationKey: reconciliationScope.integrationId } : undefined
        });
        if (deployed.isErr()) {
            return Err(functionsDeploymentError(deployed.error));
        }

        return reconcile({ functions, deployed: deployed.value }).mapError(functionsDeploymentError);
    } catch (err) {
        return Err(functionsDeploymentError(err));
    }
}

export async function deployBundle({
    accountId,
    environmentId,
    environmentName,
    reconciliation
}: {
    accountId: number;
    environmentId: number;
    environmentName: string;
    reconciliation: DeploymentBundleReconciliation;
}): Promise<Result<void, DeploymentBundleError>> {
    try {
        // Upload the files first and upsert/delete the configs in a single transaction
        // to make sure every config points to a valid file location.
        // We accept that there might be orphaned files if the transaction fails, favoring correctness and simpler rollback.
        const prepared: {
            before: CurrentFunctionConfig | undefined;
            artifact: FunctionDeploymentArtifact;
            version: string;
            fileLocation: string;
        }[] = [];

        // TODO: parallelize the uploads to speed up the deployment process
        for (const f of [...reconciliation.created, ...reconciliation.updated]) {
            const [before, artifact] = 'before' in f ? [f.before, f.after] : [undefined, f];
            const versionHash = functionVersionHash(artifact);
            if (versionHash.isErr()) {
                throw versionHash.error;
            }
            const version = versionHash.value;
            const destinationBase = `${environmentName}/account/${accountId}/environment/${environmentId}/config/${artifact.integrationId}/functions/${artifact.name}/${version}`;
            const localBase = `${artifact.integrationId}/functions/${artifact.name}`;
            const [fileLocation, sourceFileLocation] = await Promise.all([
                remoteFileService.upload({
                    content: artifact.fileBody.js,
                    destinationPath: `${destinationBase}.js`,
                    destinationLocalFileName: `${localBase}.js`
                }),
                remoteFileService.upload({
                    content: artifact.fileBody.ts,
                    destinationPath: `${destinationBase}.ts`,
                    destinationLocalFileName: `${localBase}.ts`
                })
            ]);

            if (!fileLocation || !sourceFileLocation) {
                throw new Error('file_upload_error', { cause: { integrationId: artifact.integrationId, name: artifact.name } });
            }

            prepared.push({ before, artifact, version, fileLocation });
        }

        await db.knex.transaction(async (trx) => {
            // Upsert function configs/versions
            const configsToUpsert = prepared.map(({ artifact, version, fileLocation }) => ({
                environmentId,
                integrationId: artifact.integrationId,
                name: artifact.name,
                version: {
                    description: artifact.description,
                    file_location: fileLocation,
                    version,
                    source: 'repo' as const,
                    trigger: artifact.trigger,
                    requires: artifact.requires,
                    capabilities: artifact.capabilities,
                    limits: artifact.limits,
                    input_schema_ref: artifact.input_schema_ref,
                    output_schema_ref: artifact.output_schema_ref,
                    model_schema_refs: artifact.model_schema_refs,
                    metadata_schema_ref: artifact.metadata_schema_ref,
                    checkpoint_schema_ref: artifact.checkpoint_schema_ref,
                    json_schema: artifact.json_schema
                }
            }));
            const upserted = await functionConfigService.upsert(trx, configsToUpsert);
            if (upserted.isErr()) {
                throw upserted.error;
            }

            // Delete function configs/versions that are no longer present in the deployment bundle
            const deletedConfigs = await functionConfigService.softDelete(trx, {
                environmentId,
                ids: reconciliation.deleted.map((f) => f.config.id)
            });
            if (deletedConfigs.isErr()) {
                throw deletedConfigs.error;
            }

            // reduce the configs to a list of instances to insert and delete,
            // based on connections and the before and after states of the function configs

            const instancesToUpsert: FunctionInstanceUpsert[] = [];
            const instancesToDelete: { functionConfigId: number }[] = reconciliation.deleted.map((f) => ({ functionConfigId: f.config.id }));
            for (const { before, artifact } of prepared) {
                var upsertCandidate: { functionConfigId: number; integrationId: number; artifact: FunctionDeploymentArtifact; frequency: string } | undefined =
                    undefined;

                // If the after trigger is a schedule and there is no before store, create a new instance
                if (artifact.trigger.kind === 'schedule' && !before) {
                    const functionConfig = upserted.value.find((f) => f.integration.unique_key === artifact.integrationId && f.config.name === artifact.name);
                    if (functionConfig) {
                        upsertCandidate = {
                            functionConfigId: functionConfig.config.id,
                            integrationId: functionConfig.integration.id,
                            artifact,
                            frequency: artifact.trigger.frequency
                        };
                    }
                }
                // If the after trigger is a schedule and there is a before state with a non-schedule trigger, create a new instance
                else if (artifact.trigger.kind === 'schedule' && before && before?.currentVersion.trigger.kind !== 'schedule') {
                    upsertCandidate = {
                        functionConfigId: before.config.id,
                        integrationId: before.integration.id,
                        artifact,
                        frequency: artifact.trigger.frequency
                    };
                }

                if (upsertCandidate) {
                    const connections = await connectionService.getConnectionsByEnvironmentAndConfigId(trx, {
                        environmentId,
                        configId: upsertCandidate.integrationId
                    });
                    for (const connection of connections) {
                        instancesToUpsert.push({
                            function_config_id: upsertCandidate.functionConfigId,
                            nango_connection_id: connection.id,
                            name: upsertCandidate.artifact.name,
                            variant: 'base',
                            frequency: upsertCandidate.frequency
                        });
                    }
                }

                // If the after trigger is not a schedule and there is a before state with a schedule, delete the existing schedule
                if (artifact.trigger.kind !== 'schedule' && before && before?.currentVersion.trigger.kind === 'schedule') {
                    instancesToDelete.push({ functionConfigId: before.config.id });
                }

                // Otherwise we do nothing.
                // This includes the cases where
                // - both before and after triggers are schedules (in which case we don't update existing instances)
                // - both are non-schedules.
            }

            const instances = await functionInstanceService.upsert(trx, instancesToUpsert);
            if (instances.isErr()) {
                throw instances.error;
            }

            const deletedInstances = await functionInstanceService.softDelete(trx, {
                environmentId: environmentId,
                functionConfigIds: instancesToDelete.map((i) => i.functionConfigId)
            });
            if (deletedInstances.isErr()) {
                throw deletedInstances.error;
            }
        });

        return Ok(undefined);
    } catch (err) {
        return Err(functionsDeploymentError(err));
    }
}
