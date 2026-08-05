import db from '@nangohq/database';
import { getLocking } from '@nangohq/kvstore';
import { logContextGetter } from '@nangohq/logs';
import { configService, functionConfigService, functionVersionHash, reconcile, remoteFileService } from '@nangohq/shared';
import { getLogger, report, requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { envs } from '../../../../env.js';
import { asyncWrapper } from '../../../../utils/asyncWrapper.js';
import { validation } from './validation.js';

import type { Lock } from '@nangohq/kvstore';
import type { Config as ProviderConfig } from '@nangohq/shared';
import type { FunctionDeploymentArtifact, PostFunctionDeploymentBundle } from '@nangohq/types';

const logger = getLogger('Server.PostFunctionDeploymentBundle');

/**
 * Deploy the authoritative set of functions for an environment.
 * Each function contains its own config and compiled code.
 */
export const postFunctionDeploymentBundle = asyncWrapper<PostFunctionDeploymentBundle>(async (req, res) => {
    const emptyQuery = requireEmptyQuery(req);
    if (emptyQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
        return;
    }

    const val = validation.safeParse(req.body);
    if (!val.success) {
        res.status(400).send({ error: { code: 'invalid_body', errors: zodErrorToHTTP(val.error) } });
        return;
    }

    const body: PostFunctionDeploymentBundle['Body'] = val.data;
    const { account, environment } = res.locals;
    const logCtx = body.mode === 'apply' ? await logContextGetter.create({ operation: { type: 'deploy', action: 'custom' } }, { account, environment }) : null;
    const locking = body.mode === 'apply' ? await getLocking() : null;
    let lock: Lock | undefined;

    if (body.functions.length > 0) {
        try {
            const list = await configService.listProviderConfigs(db.knex, environment.id);
            const missing = body.functions.filter((f) => !list.some((c: ProviderConfig) => c.unique_key === f.integrationId));
            if (missing.length > 0) {
                const error = new Error(`Integration(s) not found: ${missing.map((f) => f.integrationId).join(', ')}`);
                void logCtx?.error('Failed to deploy functions', { error });
                await logCtx?.failed();
                res.status(400).send({
                    error: {
                        code: 'integration_not_found',
                        message: error.message
                    }
                });
                return;
            }
        } catch (err) {
            report(err, { environmentId: environment.id });
            void logCtx?.error('Failed to deploy functions', { error: err });
            await logCtx?.failed();
            res.status(500).send({
                error: {
                    code: 'functions_deployment_error',
                    message: 'Failed to deploy functions'
                }
            });
            return;
        }
    }

    // Prevent concurrent deploys per environment, fail immediately if another deploy is in flight.
    if (locking) {
        const lockKey = `lock:deployments:bundle:${account.id}:${environment.id}`;
        try {
            lock = await locking.acquire(lockKey, envs.DEPLOY_LOCK_TTL_MS);
        } catch (err) {
            void logCtx?.error('Failed to deploy functions', { error: err });
            await logCtx?.failed();
            res.status(409).send({
                error: {
                    code: 'concurrent_deployment',
                    message: 'A deployment is already in progress. Please wait for the current deployment to finish.'
                }
            });
            return;
        }
    }

    try {
        const deployedResult = await functionConfigService.search(db.knex, { environmentId: environment.id });
        if (deployedResult.isErr()) {
            throw deployedResult.error;
        }

        const reconciliationResult = reconcile({ functions: body.functions, deployed: deployedResult.value });
        if (reconciliationResult.isErr()) {
            throw reconciliationResult.error;
        }
        const reconciliation = reconciliationResult.value;
        const response: PostFunctionDeploymentBundle['Success'] = {
            created: reconciliation.created.map(({ integrationId, name }) => ({ integrationId, name })),
            updated: reconciliation.updated.map(({ integrationId, name }) => ({ integrationId, name })),
            unchanged: reconciliation.unchanged.map(({ integrationId, name }) => ({ integrationId, name })),
            deleted: reconciliation.deleted.map((current) => ({
                integrationId: current.integration.unique_key,
                name: current.config.name
            }))
        };

        if (body.mode === 'preview') {
            res.send(response);
            return;
        }

        // Upload the files first and upsert/delete the configs in a single transaction
        // to make sure every config points to a valid file location
        // We accept that there might be orphaned files if the transaction fails, favoring correctness and simpler rollback.
        const prepared: { artifact: FunctionDeploymentArtifact; version: string; fileLocation: string }[] = [];

        // TODO: parallelize the uploads to speed up the deployment process
        for (const artifact of [...reconciliation.created, ...reconciliation.updated]) {
            const versionResult = functionVersionHash(artifact);
            if (versionResult.isErr()) {
                throw versionResult.error;
            }
            const version = versionResult.value;
            const destinationBase = `${environment.name}/account/${account.id}/environment/${environment.id}/config/${artifact.integrationId}/functions/${artifact.name}/${version}`;
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
                const upsertResult = await functionConfigService.upsert(trx, {
                    environmentId: environment.id,
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
                if (upsertResult.isErr()) {
                    throw upsertResult.error;
                }
            }

            const deleteResult = await functionConfigService.softDelete(trx, {
                environmentId: environment.id,
                ids: reconciliation.deleted.map((current) => current.config.id)
            });
            if (deleteResult.isErr()) {
                throw deleteResult.error;
            }
        });

        void logCtx?.info('Successfully deployed function bundle', { functionCount: body.functions.length, ...response });
        await logCtx?.success();
        res.send(response);
    } catch (err) {
        report(err, { environmentId: environment.id });
        void logCtx?.error('Failed to deploy functions', { error: err });
        await logCtx?.failed();
        res.status(500).send({
            error: {
                code: 'functions_deployment_error',
                message: 'Failed to deploy functions'
            }
        });
    } finally {
        if (lock && locking) {
            try {
                await locking.release(lock);
            } catch (err) {
                logger.error('Error releasing function bundle deployment lock', { lock: lock.key, error: err });
            }
        }
    }
});
