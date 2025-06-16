import db from '@nangohq/database';
import { nangoConfigFile } from '@nangohq/nango-yaml';
import { Err, Ok, env, filterJsonSchemaForModels } from '@nangohq/utils';

import { NangoError } from '../../utils/error.js';
import configService from '../config.service.js';
import { switchActiveSyncConfig } from './utils.js';
import remoteFileService from '../file/remote.service.js';
import { getSyncAndActionConfigByParams, getSyncAndActionConfigsBySyncNameAndConfigId } from '../sync/config/config.service.js';

import type { LogContext, LogContextGetter } from '@nangohq/logs';
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

export async function deployTemplate({
    environment,
    account,
    template,
    deployInfo,
    logContextGetter
}: {
    environment: DBEnvironment;
    account: DBTeam;
    template: NangoSyncConfig;
    deployInfo: { integrationId: string; provider: string };
    logContextGetter: LogContextGetter;
}): Promise<Result<{ result: SyncDeploymentResult; logCtx: LogContext }>> {
    const logCtx = await logContextGetter.create({ operation: { type: 'deploy', action: 'prebuilt' } }, { account, environment });

    const idsToMarkAsInactive = [];
    const publicRoute = deployInfo.provider;
    const remoteBasePath = `${env}/account/${account.id}/environment/${environment.id}`;

    // this is a public template so copy it from the public location
    // We might not want to do this as it just overrides the root nango.yaml
    // which means we overwrite any custom nango.yaml that the user has
    const copy = await remoteFileService.copy({
        sourcePath: `${publicRoute}/${nangoConfigFile}`,
        destinationPath: `${remoteBasePath}/${nangoConfigFile}`,
        destinationLocalPath: nangoConfigFile
    });
    if (!copy) {
        void logCtx.error('There was an error uploading the template definition');
        await logCtx.failed();
        return Err(new NangoError('failed_to_copy_yaml'));
    }

    const integration = await configService.getProviderConfig(deployInfo.integrationId, environment.id);
    if (!integration) {
        return Err(new NangoError('unknown_provider_config', { providerConfigKey: deployInfo.integrationId }));
    }

    const remoteBasePathConfig = `${remoteBasePath}/config/${integration.id}`;

    const exists = await getSyncAndActionConfigByParams(environment.id, template.name, deployInfo.integrationId, true);
    if (exists) {
        return Err(new NangoError('template_already_deployed'));
    }

    const version = template.version || '0.0.1';

    void logCtx.info(`Uploading ${deployInfo.integrationId} -> ${template.name}@${version}`);

    const file_location = await remoteFileService.copy({
        sourcePath: `${publicRoute}/dist/${template.name}-${deployInfo.provider}.js`,
        destinationPath: `${remoteBasePathConfig}/${template.name}-v${version}.js`,
        destinationLocalPath: `dist/${template.name}-${deployInfo.integrationId}.js`
    });
    if (!file_location) {
        void logCtx.error('There was an error uploading the template');
        await logCtx.failed();

        return Err(new NangoError('file_upload_error'));
    }

    let models_json_schema: JSONSchema7 | null = null;

    const copyTs = await remoteFileService.copy({
        sourcePath: `${publicRoute}/${template.type}s/${template.name}.ts`,
        destinationPath: `${remoteBasePathConfig}/${template.name}.ts`,
        destinationLocalPath: `${deployInfo.integrationId}/${template.type}s/${template.name}.ts`
    });
    if (!copyTs) {
        void logCtx.error('There was an error uploading the source file');
        await logCtx.failed();
        return Err(new NangoError('source_copy_error'));
    }

    // fetch the json schema so we have type checking
    const jsonSchemaString = await remoteFileService.getPublicTemplateJsonSchemaFile(publicRoute);
    if (!jsonSchemaString) {
        void logCtx.error('There was an error getting the json schema');
        await logCtx.failed();
        return Err(new NangoError('source_copy_error'));
    }

    const modelsNames = [...template.returns, template.input].filter(Boolean) as string[];
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
        file_location,
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
        sdk_version: null, // TODO: fill this somehow
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
                created_at: new Date(),
                updated_at: new Date()
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

        throw new NangoError('error_creating_sync_config');
    }
}
