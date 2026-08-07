import db from '@nangohq/database';
import { Err, Ok } from '@nangohq/utils';

import configService from '../config.service.js';
import remoteFileService from '../file/remote.service.js';
import * as functionConfigService from './models/functions.js';
import { reconcile } from './reconcile.js';
import { functionVersionHash } from './version.js';

import type { DeploymentBundleReconciliation } from './reconcile.js';
import type { FunctionDeploymentArtifact } from '@nangohq/types';
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
    environmentId
}: {
    functions: FunctionDeploymentArtifact[];
    environmentId: number;
}): Promise<Result<DeploymentBundleReconciliation, DeploymentBundlePreparationError>> {
    try {
        if (functions.length > 0) {
            const integrations = await configService.listProviderConfigs(db.knex, environmentId);
            const integrationIds = new Set(integrations.map((integration) => integration.unique_key));
            const missingIntegrationIds = [...new Set(functions.map((fn) => fn.integrationId).filter((integrationId) => !integrationIds.has(integrationId)))];
            if (missingIntegrationIds.length > 0) {
                return Err(integrationNotFoundError(missingIntegrationIds));
            }
        }

        const deployed = await functionConfigService.search(db.knex, { environmentId });
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
        const prepared: { artifact: FunctionDeploymentArtifact; version: string; fileLocation: string }[] = [];

        // TODO: parallelize the uploads to speed up the deployment process
        for (const artifact of [...reconciliation.created, ...reconciliation.updated]) {
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

            prepared.push({ artifact, version, fileLocation });
        }

        await db.knex.transaction(async (trx) => {
            for (const { artifact, version, fileLocation } of prepared) {
                const upserted = await functionConfigService.upsert(trx, {
                    environmentId,
                    integrationId: artifact.integrationId,
                    name: artifact.name,
                    version: {
                        description: artifact.description,
                        file_location: fileLocation,
                        version,
                        source: 'repo',
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
                });
                if (upserted.isErr()) {
                    throw upserted.error;
                }
            }

            const deleted = await functionConfigService.softDelete(trx, {
                environmentId,
                ids: reconciliation.deleted.map((current) => current.config.id)
            });
            if (deleted.isErr()) {
                throw deleted.error;
            }
        });

        return Ok(undefined);
    } catch (err) {
        return Err(functionsDeploymentError(err));
    }
}
