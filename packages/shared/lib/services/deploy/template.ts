import db from '@nangohq/database';
import { env, Err, Ok } from '@nangohq/utils';

import { envs } from '../../env.js';
import { NangoError } from '../../utils/error.js';
import remoteFileService from '../file/remote.service.js';
import { getSyncAndActionConfigByParams, getSyncAndActionConfigsBySyncNameAndConfigId } from '../sync/config/config.service.js';
import { switchActiveSyncConfig } from './utils.js';

import type { Config } from '../../models/Provider.js';
import type { Sync } from '../../models/Sync.js';
import type { LogContext } from '@nangohq/logs';
import type {
    DBEnvironment,
    DBSyncConfig,
    DBSyncConfigInsert,
    DBSyncEndpoint,
    DBSyncEndpointCreate,
    DBTeam,
    NangoSyncConfig,
    Result,
    SyncDeploymentResult
} from '@nangohq/types';

type TemplateDeployIntegration = Pick<Config, 'id' | 'unique_key' | 'provider'>;

/**
 * Deploy a template from the S3 public folder, to the database and S3
 */
export async function deployTemplate({
    environment,
    team,
    template,
    integration,
    deployInfo,
    logCtx
}: {
    environment: DBEnvironment;
    team: DBTeam;
    template: NangoSyncConfig;
    integration: Config;
    deployInfo: { integrationId: string; provider: string };
    logCtx: LogContext;
}): Promise<Result<{ result: SyncDeploymentResult; logCtx: LogContext }>> {
    const idsToMarkAsInactive: number[] = [];
    const publicRoute = deployInfo.provider;
    const remoteBasePath = `${env}/account/${team.id}/environment/${environment.id}`;

    const remoteBasePathConfig = `${remoteBasePath}/config/${integration.id}`;

    const exists = await getSyncAndActionConfigByParams(environment.id, template.name, integration, 'catalog');
    if (exists) {
        return Err(new NangoError('template_already_deployed'));
    }

    if (!template.json_schema) {
        void logCtx.error('Template missing json schema');
        await logCtx.failed();
        return Err(new NangoError('deploy_missing_json_schema_model'));
    }

    const version = template.version || '0.0.1';

    void logCtx.info(`Uploading ${deployInfo.integrationId} -> ${template.name}@${version}`);

    // Copy the main js file
    const copyJs = await remoteFileService.copy({
        sourcePath: `${publicRoute}/build/${deployInfo.provider}_${template.type}s_${template.name}.cjs`,
        destinationPath: `${remoteBasePathConfig}/${template.name}-v${version}.js`,
        destinationLocalFileName: `build/${deployInfo.provider}-${template.type}s-${template.name}.cjs`
    });
    if (!copyJs) {
        void logCtx.error('There was an error uploading the main js file');
        await logCtx.failed();

        return Err(new NangoError('file_upload_error'));
    }

    // Copy the typescript source file
    const copyTs = await remoteFileService.copy({
        sourcePath: `${publicRoute}/${template.type}s/${template.name}.ts`,
        destinationPath: `${remoteBasePathConfig}/${template.name}.ts`,
        destinationLocalFileName: `${deployInfo.integrationId}/${template.type}s/${template.name}.ts`
    });
    if (!copyTs) {
        void logCtx.error('There was an error uploading the source file');
        await logCtx.failed();
        return Err(new NangoError('source_copy_error'));
    }

    const modelsNames = [...template.returns, template.input].filter(Boolean) as string[];

    // select all active rows, not just .first(), so any duplicates left by prior races are also cleaned up.
    const oldConfigs = await getSyncAndActionConfigsBySyncNameAndConfigId(environment.id, integration.id!, template.name);
    if (oldConfigs.length > 0) {
        const ids = oldConfigs.map((oldConfig) => oldConfig.id);
        idsToMarkAsInactive.push(...ids);
    }

    const created_at = new Date();

    const toInsert: DBSyncConfigInsert = {
        created_at,
        sync_name: template.name,
        nango_config_id: integration.id!,
        file_location: copyJs,
        version,
        models: template.returns,
        active: true,
        runs: template.type === 'sync' ? template.runs! : null,
        model_schema: null,
        input: template.input || null,
        environment_id: environment.id,
        deleted: false,
        track_deletes: template.type === 'sync' ? template.track_deletes! : false,
        type: template.type!,
        auto_start: template.type === 'sync' ? !!template.auto_start : false,
        attributes: {},
        metadata: { description: template.description, scopes: template.scopes },
        source: 'catalog',
        enabled: true,
        webhook_subscriptions: null,
        models_json_schema: template.json_schema,
        sdk_version: template.sdk_version,
        features: template.features,
        updated_at: new Date(),
        sync_type: 'sync_type' in template ? template.sync_type : null
    };

    const deployResult: SyncDeploymentResult = {
        ...template,
        providerConfigKey: deployInfo.integrationId,
        ...toInsert,
        last_deployed: created_at,
        input: template.input || null,
        models: modelsNames
    };
    const now = new Date();

    try {
        // Wrap all database operations in a transaction to ensure atomicity
        await db.knex.transaction(async (trx) => {
            // Mark old configs as inactive BEFORE inserting new ones
            if (idsToMarkAsInactive.length > 0) {
                await trx.from<DBSyncConfig>('_nango_sync_configs').update({ active: false }).whereIn('id', idsToMarkAsInactive);
            }

            const syncConfigs = await trx.from<DBSyncConfig>('_nango_sync_configs').insert(toInsert).returning('*');
            if (syncConfigs.length !== 1 || !syncConfigs[0]) {
                void logCtx.error('Failed to insert');
                await logCtx.failed();
                throw new NangoError('failed_to_insert');
            }

            deployResult.id = syncConfigs[0].id;

            const endpoints: DBSyncEndpointCreate[] = template.endpoints.map((endpoint, index) => {
                return {
                    sync_config_id: deployResult.id!,
                    method: endpoint.method,
                    path: endpoint.path,
                    group_name: endpoint.group || null,
                    model: template.returns[index] || null,
                    created_at: now,
                    updated_at: now
                };
            });
            if (endpoints.length > 0) {
                await trx.from<DBSyncEndpoint>('_nango_sync_endpoints').insert(endpoints);
            }

            // Use the switchActiveSyncConfig function for each inactive config
            for (const id of idsToMarkAsInactive) {
                await switchActiveSyncConfig(id, trx);
            }
        });

        void logCtx.info('Successfully deployed');
        await logCtx.success();

        return Ok({ result: deployResult, logCtx });
    } catch (err) {
        void logCtx.error('Failed to deploy', { error: err });
        await logCtx.failed();

        return Err(new NangoError('error_creating_sync_config'));
    }
}

export type DeployTemplatesSkipReason = 'already_deployed' | 'missing_json_schema' | 'copy_failed';

export interface DeployTemplatesResult {
    deployed: SyncDeploymentResult[];
    skipped: { name: string; reason: DeployTemplatesSkipReason }[];
}

/**
 * Deploy many catalog templates in one pass: parallel file copies, then a single DB transaction.
 * Skips names that already have an active config (custom or catalog) instead of failing the batch.
 * Does not call logCtx.success/failed — the caller owns the operation outcome.
 */
export async function deployTemplates({
    environment,
    team,
    templates,
    integration,
    deployInfo,
    logCtx
}: {
    environment: DBEnvironment;
    team: DBTeam;
    templates: NangoSyncConfig[];
    integration: TemplateDeployIntegration;
    deployInfo: { integrationId: string; provider: string };
    logCtx: LogContext;
}): Promise<DeployTemplatesResult> {
    const skipped: DeployTemplatesResult['skipped'] = [];
    if (templates.length === 0) {
        return { deployed: [], skipped };
    }

    const existing = await db.knex
        .from<DBSyncConfig>('_nango_sync_configs')
        .where({
            environment_id: environment.id,
            nango_config_id: integration.id!,
            active: true,
            deleted: false
        })
        .select<{ sync_name: string }[]>('sync_name');
    const existingNames = new Set(existing.map((row) => row.sync_name));

    const toCopy: NangoSyncConfig[] = [];
    for (const template of templates) {
        if (existingNames.has(template.name)) {
            skipped.push({ name: template.name, reason: 'already_deployed' });
            continue;
        }
        if (!template.json_schema) {
            void logCtx.error(`Template missing json schema: ${template.name}`);
            skipped.push({ name: template.name, reason: 'missing_json_schema' });
            continue;
        }
        toCopy.push(template);
    }

    const copied: { template: NangoSyncConfig; copyJs: string }[] = [];
    for (let i = 0; i < toCopy.length; i += envs.DEPLOY_BATCH_SIZE) {
        const batch = toCopy.slice(i, i + envs.DEPLOY_BATCH_SIZE);
        const batchResults = await Promise.all(
            batch.map(async (template) => {
                const copyJs = await copyTemplateFiles({ template, integration, deployInfo, environment, team, logCtx });
                return { template, copyJs };
            })
        );
        for (const { template, copyJs } of batchResults) {
            if (!copyJs) {
                skipped.push({ name: template.name, reason: 'copy_failed' });
                continue;
            }
            copied.push({ template, copyJs });
        }
    }

    if (copied.length === 0) {
        return { deployed: [], skipped };
    }

    const created_at = new Date();
    const now = new Date();
    const toInsert: DBSyncConfigInsert[] = copied.map(({ template, copyJs }) =>
        toSyncConfigInsert({ template, integration, environment, fileLocation: copyJs, createdAt: created_at })
    );

    const deployResults: SyncDeploymentResult[] = copied.map(({ template }, index) => {
        const insert = toInsert[index]!;
        return {
            ...template,
            providerConfigKey: deployInfo.integrationId,
            ...insert,
            last_deployed: created_at,
            input: template.input || null,
            models: [...template.returns, template.input].filter(Boolean) as string[]
        };
    });

    try {
        await db.knex.transaction(async (trx) => {
            const inserted = await trx.from<DBSyncConfig>('_nango_sync_configs').insert(toInsert).returning('*');
            if (inserted.length !== toInsert.length) {
                throw new NangoError('failed_to_insert');
            }

            const endpoints: DBSyncEndpointCreate[] = [];
            for (const [index, row] of inserted.entries()) {
                const template = copied[index]!.template;
                deployResults[index]!.id = row.id;
                for (const [endpointIndex, endpoint] of template.endpoints.entries()) {
                    endpoints.push({
                        sync_config_id: row.id,
                        method: endpoint.method,
                        path: endpoint.path,
                        group_name: endpoint.group || null,
                        model: template.returns[endpointIndex] || null,
                        created_at: now,
                        updated_at: now
                    });
                }
            }
            if (endpoints.length > 0) {
                await trx.from<DBSyncEndpoint>('_nango_sync_endpoints').insert(endpoints);
            }
        });
    } catch (err) {
        void logCtx.error('Failed to deploy catalog templates', { error: err });
        throw err;
    }

    const names = deployResults.map((result) => result.name);
    void logCtx.info(`Successfully deployed ${names.length} catalog templates`, { names });
    return { deployed: deployResults, skipped };
}

async function copyTemplateFiles({
    template,
    integration,
    deployInfo,
    environment,
    team,
    logCtx
}: {
    template: NangoSyncConfig;
    integration: TemplateDeployIntegration;
    deployInfo: { integrationId: string; provider: string };
    environment: DBEnvironment;
    team: DBTeam;
    logCtx: LogContext;
}): Promise<string | null> {
    const version = template.version || '0.0.1';
    const publicRoute = deployInfo.provider;
    const remoteBasePathConfig = `${env}/account/${team.id}/environment/${environment.id}/config/${integration.id}`;

    void logCtx.info(`Uploading ${deployInfo.integrationId} -> ${template.name}@${version}`);

    const [copyJs, copyTs] = await Promise.all([
        remoteFileService.copy({
            sourcePath: `${publicRoute}/build/${deployInfo.provider}_${template.type}s_${template.name}.cjs`,
            destinationPath: `${remoteBasePathConfig}/${template.name}-v${version}.js`,
            destinationLocalFileName: `build/${deployInfo.provider}-${template.type}s-${template.name}.cjs`
        }),
        remoteFileService.copy({
            sourcePath: `${publicRoute}/${template.type}s/${template.name}.ts`,
            destinationPath: `${remoteBasePathConfig}/${template.name}.ts`,
            destinationLocalFileName: `${deployInfo.integrationId}/${template.type}s/${template.name}.ts`
        })
    ]);

    if (!copyJs) {
        void logCtx.error(`There was an error uploading the main js file for ${template.name}`);
        return null;
    }
    if (!copyTs) {
        void logCtx.error(`There was an error uploading the source file for ${template.name}`);
        return null;
    }
    return copyJs;
}

function toSyncConfigInsert({
    template,
    integration,
    environment,
    fileLocation,
    createdAt
}: {
    template: NangoSyncConfig;
    integration: TemplateDeployIntegration;
    environment: DBEnvironment;
    fileLocation: string;
    createdAt: Date;
}): DBSyncConfigInsert {
    return {
        created_at: createdAt,
        sync_name: template.name,
        nango_config_id: integration.id!,
        file_location: fileLocation,
        version: template.version || '0.0.1',
        models: template.returns,
        active: true,
        runs: template.type === 'sync' ? template.runs! : null,
        model_schema: null,
        input: template.input || null,
        environment_id: environment.id,
        deleted: false,
        track_deletes: template.type === 'sync' ? template.track_deletes! : false,
        type: template.type!,
        auto_start: template.type === 'sync' ? !!template.auto_start : false,
        attributes: {},
        metadata: { description: template.description, scopes: template.scopes },
        source: 'catalog',
        enabled: true,
        webhook_subscriptions: null,
        models_json_schema: template.json_schema,
        sdk_version: template.sdk_version,
        features: template.features,
        updated_at: createdAt,
        sync_type: 'sync_type' in template ? template.sync_type : null
    };
}

/**
 * Upgrade a template from any version to latest (only)
 * It will replace the existing sync config, endpoints and files
 */
export async function upgradeTemplate({
    environment,
    team,
    integration,
    syncConfig,
    template,
    logCtx
}: {
    environment: DBEnvironment;
    team: DBTeam;
    integration: Config;
    // The current sync config
    syncConfig: DBSyncConfig;
    // The new version of the template
    template: NangoSyncConfig;
    logCtx: LogContext;
}): Promise<Result<boolean | null>> {
    const { unique_key: provider_config_key, provider } = integration;
    const publicRoute = provider;
    const remoteBasePath = `${env}/account/${team.id}/environment/${environment.id}`;
    const remoteBasePathConfig = `${remoteBasePath}/config/${syncConfig.nango_config_id}`;

    void logCtx.info(`Upgrading ${syncConfig.type} -> ${syncConfig.sync_name} version ${syncConfig.version} to version ${template.version}`);

    // Copy the main js file
    const copyJs = await remoteFileService.copy({
        sourcePath: `${publicRoute}/build/${provider}_${template.type}s_${template.name}.cjs`,
        destinationPath: `${remoteBasePathConfig}/${template.name}-v${template.version}.js`,
        destinationLocalFileName: `build/${provider}-${template.type}s-${template.name}.cjs`
    });
    if (!copyJs) {
        void logCtx.error('There was an error uploading the main js file');
        await logCtx.failed();

        return Err(new NangoError('file_upload_error'));
    }

    // Copy the typescript source file
    const copyTs = await remoteFileService.copy({
        sourcePath: `${publicRoute}/${template.type}s/${template.name}.ts`,
        destinationPath: `${remoteBasePathConfig}/${template.name}.ts`,
        destinationLocalFileName: `${provider_config_key}/${template.type}s/${template.name}.ts`
    });
    if (!copyTs) {
        void logCtx.error('There was an error uploading the source file');
        await logCtx.failed();
        return Err(new NangoError('source_copy_error'));
    }

    const now = new Date();

    const { id, ...restWithoutId } = syncConfig;
    const flowData: DBSyncConfigInsert = {
        ...restWithoutId,
        created_at: now,
        updated_at: now,
        version: template.version!,
        file_location: copyJs,
        model_schema: null,
        metadata: template.metadata || {},
        auto_start: template.auto_start === true,
        track_deletes: template.track_deletes === true,
        models: template.returns,
        sdk_version: template.sdk_version,
        features: template.features,
        models_json_schema: template.json_schema,
        input: template.input || null,
        runs: template.type === 'sync' ? template.runs! : null
    };

    try {
        return await db.knex.transaction(async (trx) => {
            // Create the new sync config row
            const [newSyncConfig] = await trx.from<DBSyncConfig>('_nango_sync_configs').insert(flowData).returning('*');
            if (!newSyncConfig?.id) {
                return Err(new NangoError('error_creating_sync_config'));
            }

            const newSyncConfigId = newSyncConfig.id;

            // update sync_config_id in syncs table
            await trx.from<Sync>('_nango_syncs').update({ sync_config_id: newSyncConfigId }).where('sync_config_id', syncConfig.id);

            // create endpoints
            const endpoints: DBSyncEndpointCreate[] = template.endpoints.map((endpoint, index) => {
                return {
                    sync_config_id: newSyncConfigId,
                    method: endpoint.method,
                    path: endpoint.path,
                    group_name: endpoint.group || null,
                    model: template.returns[index] || null,
                    created_at: now,
                    updated_at: now
                };
            });
            if (endpoints.length > 0) {
                await trx.from<DBSyncEndpoint>('_nango_sync_endpoints').insert(endpoints);
            }

            await trx.from<DBSyncConfig>('_nango_sync_configs').update({ active: false }).whereIn('id', [syncConfig.id]);

            void logCtx.info('Successfully deployed');
            await logCtx.success();

            return Ok(true);
        });
    } catch (err) {
        void logCtx.error('Failed to upgrade', { error: err });
        await logCtx.failed();

        return Err(new NangoError('error_creating_sync_config'));
    }
}
