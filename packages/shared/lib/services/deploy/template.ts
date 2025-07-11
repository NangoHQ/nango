import db from '@nangohq/database';
import { nangoConfigFile } from '@nangohq/nango-yaml';
import { Err, Ok, env, filterJsonSchemaForModels } from '@nangohq/utils';

import { switchActiveSyncConfig } from './utils.js';
import { NangoError } from '../../utils/error.js';
import remoteFileService from '../file/remote.service.js';
import { getSyncAndActionConfigByParams, getSyncAndActionConfigsBySyncNameAndConfigId } from '../sync/config/config.service.js';

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
import type { JSONSchema7 } from 'json-schema';

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
    const idsToMarkAsInactive = [];
    const publicRoute = deployInfo.provider;
    const remoteBasePath = `${env}/account/${team.id}/environment/${environment.id}`;

    const remoteBasePathConfig = `${remoteBasePath}/config/${integration.id}`;

    const exists = await getSyncAndActionConfigByParams(environment.id, template.name, deployInfo.integrationId, true);
    if (exists) {
        return Err(new NangoError('template_already_deployed'));
    }

    const version = template.version || '0.0.1';

    void logCtx.info(`Uploading ${deployInfo.integrationId} -> ${template.name}@${version}`);

    if (!template.is_zero_yaml) {
        // Copy nango.yaml
        // this is a public template so copy it from the public location
        // We might not want to do this as it just overrides the root nango.yaml
        // which means we overwrite any custom nango.yaml that the user has
        const copy = await remoteFileService.copy({
            sourcePath: `${publicRoute}/${nangoConfigFile}`,
            destinationPath: `${remoteBasePath}/${nangoConfigFile}`,
            destinationLocalPath: nangoConfigFile,
            isZeroYaml: false
        });
        if (!copy) {
            void logCtx.error('There was an error uploading the nango.yaml file');
            await logCtx.failed();
            return Err(new NangoError('failed_to_copy_yaml'));
        }
    }

    // Copy the main js file
    const copyJs = await remoteFileService.copy({
        sourcePath: template.is_zero_yaml
            ? `${publicRoute}/build/${deployInfo.provider}_${template.type}s_${template.name}.cjs`
            : `${publicRoute}/dist/${template.name}-${deployInfo.provider}.js`,
        destinationPath: `${remoteBasePathConfig}/${template.name}-v${version}.js`,
        destinationLocalPath: template.is_zero_yaml
            ? `build/${deployInfo.provider}-${template.type}s-${template.name}.cjs`
            : `dist/${template.name}-${deployInfo.integrationId}.js`,
        isZeroYaml: template.is_zero_yaml
    });
    if (!copyJs) {
        void logCtx.error('There was an error uploading the main js file');
        await logCtx.failed();

        return Err(new NangoError('file_upload_error'));
    }

    // Copy the typescript source file
    const copyTs = await remoteFileService.copy({
        sourcePath: template.is_zero_yaml ? `${publicRoute}/${template.type}s/${template.name}.ts` : `${publicRoute}/${template.type}s/${template.name}.ts`,
        destinationPath: `${remoteBasePathConfig}/${template.name}.ts`,
        destinationLocalPath: `${deployInfo.integrationId}/${template.type}s/${template.name}.ts`,
        isZeroYaml: template.is_zero_yaml
    });
    if (!copyTs) {
        void logCtx.error('There was an error uploading the source file');
        await logCtx.failed();
        return Err(new NangoError('source_copy_error'));
    }

    const modelsNames = [...template.returns, template.input].filter(Boolean) as string[];
    // If it's a zero yaml template json schema is pre-bundled
    // otherwise fetch it from the public folder
    let models_json_schema: JSONSchema7 | null = null;
    if (template.json_schema) {
        models_json_schema = template.json_schema;
    } else {
        // fetch the json schema so we have type checking
        const jsonSchemaString = await remoteFileService.getPublicTemplateJsonSchemaFile(publicRoute);
        if (!jsonSchemaString) {
            void logCtx.error('There was an error getting the json schema');
            await logCtx.failed();
            return Err(new NangoError('source_copy_error'));
        }

        if (jsonSchemaString) {
            const jsonSchema = JSON.parse(jsonSchemaString) as JSONSchema7;
            const result = filterJsonSchemaForModels(jsonSchema, modelsNames);
            if (result.isErr()) {
                void logCtx.error('There was an error parsing the json schema', { error: result.error });
                await logCtx.failed();
                return Err(new NangoError('deploy_missing_json_schema_model', result.error));
            }
            models_json_schema = result.value;
        }
    }

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
        pre_built: true,
        is_public: true,
        enabled: true,
        webhook_subscriptions: null,
        models_json_schema,
        sdk_version: template.sdk_version,
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
        const syncConfigs = await db.knex.from<DBSyncConfig>('_nango_sync_configs').insert(toInsert).returning('*');
        if (syncConfigs.length !== 1 || !syncConfigs[0]) {
            void logCtx.error('Failed to insert');
            await logCtx.failed();
            return Err(new NangoError('failed_to_insert'));
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
            await db.knex.from<DBSyncEndpoint>('_nango_sync_endpoints').insert(endpoints);
        }

        for (const id of idsToMarkAsInactive) {
            await switchActiveSyncConfig(id);
        }

        void logCtx.info('Successfully deployed');
        await logCtx.success();

        return Ok({ result: deployResult, logCtx });
    } catch (err) {
        void logCtx.error('Failed to deploy', { error: err });
        await logCtx.failed();

        return Err(new NangoError('error_creating_sync_config'));
    }
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
        sourcePath: template.is_zero_yaml
            ? `${publicRoute}/build/${provider}_${template.type}s_${template.name}.cjs`
            : `${publicRoute}/dist/${template.name}-${provider}.js`,
        destinationPath: `${remoteBasePathConfig}/${template.name}-v${template.version}.js`,
        destinationLocalPath: template.is_zero_yaml
            ? `build/${provider}-${template.type}s-${template.name}.cjs`
            : `dist/${template.name}-${provider_config_key}.js`,
        isZeroYaml: template.is_zero_yaml
    });
    if (!copyJs) {
        void logCtx.error('There was an error uploading the main js file');
        await logCtx.failed();

        return Err(new NangoError('file_upload_error'));
    }

    // Copy the typescript source file
    const copyTs = await remoteFileService.copy({
        sourcePath: template.is_zero_yaml ? `${publicRoute}/${template.type}s/${template.name}.ts` : `${publicRoute}/${template.type}s/${template.name}.ts`,
        destinationPath: `${remoteBasePathConfig}/${template.name}.ts`,
        destinationLocalPath: `${provider_config_key}/${template.type}s/${template.name}.ts`,
        isZeroYaml: template.is_zero_yaml
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
