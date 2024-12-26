import db, { dbNamespace } from '@nangohq/database';
import configService from '../../config.service.js';
import remoteFileService from '../../file/remote.service.js';
import { getSyncsByProviderConfigAndSyncName } from '../sync.service.js';
import { getSyncAndActionConfigByParams, increment, getSyncAndActionConfigsBySyncNameAndConfigId } from './config.service.js';
import connectionService from '../../connection.service.js';
import { LogActionEnum } from '../../../models/Telemetry.js';
import type { ServiceResponse } from '../../../models/Generic.js';
import type { SyncModelSchema, SyncConfig, SyncType, Sync } from '../../../models/Sync.js';
import type {
    DBEnvironment,
    DBTeam,
    CleanedIncomingFlowConfig,
    IncomingPreBuiltFlowConfig,
    NangoModel,
    OnEventScriptsByProvider,
    NangoSyncEndpointV2,
    IncomingFlowConfig,
    HTTP_METHOD,
    SyncDeploymentResult,
    DBSyncEndpointCreate,
    DBSyncEndpoint
} from '@nangohq/types';
import { onEventScriptService } from '../../on-event-scripts.service.js';
import { NangoError } from '../../../utils/error.js';
import telemetry, { LogTypes } from '../../../utils/telemetry.js';
import { env, Ok } from '@nangohq/utils';
import type { Result } from '@nangohq/utils';
import type { LogContext, LogContextGetter } from '@nangohq/logs';
import type { Orchestrator } from '../../../clients/orchestrator.js';
import type { Merge } from 'type-fest';
import type { JSONSchema7 } from 'json-schema';
import type { Config } from '../../../models/Provider.js';
import type { NangoSyncConfig } from '../../../models/NangoConfig.js';
import { nangoConfigFile } from '@nangohq/nango-yaml';

const TABLE = dbNamespace + 'sync_configs';
const SYNC_TABLE = dbNamespace + 'syncs';
const ENDPOINT_TABLE = dbNamespace + 'sync_endpoints';

const nameOfType = 'sync/action';

type FlowParsed = Merge<CleanedIncomingFlowConfig, { model_schema: NangoModel[] }>;
type FlowWithoutScript = Omit<FlowParsed, 'fileBody'>;

interface SyncConfigResult {
    result: SyncDeploymentResult[];
    logCtx: LogContext;
}

/**
 * Transform received incoming flow from the CLI to an internally standard object
 */
export function cleanIncomingFlow(flowConfigs: IncomingFlowConfig[]): CleanedIncomingFlowConfig[] {
    const cleaned: CleanedIncomingFlowConfig[] = [];
    for (const flow of flowConfigs) {
        const parsedEndpoints = flow.endpoints
            ? flow.endpoints.map<NangoSyncEndpointV2>((endpoint) => {
                  if ('path' in endpoint) {
                      return endpoint;
                  }
                  const entries = Object.entries(endpoint) as [HTTP_METHOD, string][];
                  return { method: entries[0]![0], path: entries[0]![1] };
              })
            : [];
        cleaned.push({ ...flow, endpoints: parsedEndpoints });
    }
    return cleaned;
}

export async function deploy({
    environment,
    account,
    flows,
    jsonSchema,
    onEventScriptsByProvider,
    nangoYamlBody,
    logContextGetter,
    orchestrator,
    debug
}: {
    environment: DBEnvironment;
    account: DBTeam;
    flows: CleanedIncomingFlowConfig[];
    jsonSchema?: JSONSchema7 | undefined;
    onEventScriptsByProvider?: OnEventScriptsByProvider[] | undefined;
    nangoYamlBody: string;
    logContextGetter: LogContextGetter;
    orchestrator: Orchestrator;
    debug?: boolean;
}): Promise<ServiceResponse<SyncConfigResult | null>> {
    const providers = flows.map((flow) => flow.providerConfigKey);

    const logCtx = await logContextGetter.create({ operation: { type: 'deploy', action: 'custom' } }, { account, environment });

    if (nangoYamlBody) {
        await remoteFileService.upload(nangoYamlBody, `${env}/account/${account.id}/environment/${environment.id}/${nangoConfigFile}`, environment.id);
    }

    const deployResults: SyncDeploymentResult[] = [];
    const flowsWithoutScript: FlowWithoutScript[] = [];
    const idsToMarkAsInactive: number[] = [];
    const syncConfigs: SyncConfig[] = [];
    for (const flow of flows) {
        const flowParsed: FlowParsed = {
            ...flow,
            model_schema: typeof flow.model_schema === 'string' ? (JSON.parse(flow.model_schema) as NangoModel[]) : flow.model_schema
        };
        const { fileBody: _fileBody, ...rest } = flowParsed;
        flowsWithoutScript.push({ ...rest });

        const { success, error, response } = await compileDeployInfo({
            flow: flowParsed,
            jsonSchema,
            env,
            environment_id: environment.id,
            account,
            debug: Boolean(debug),
            logCtx,
            orchestrator
        });

        if (!success || !response) {
            await logCtx.error(`Failed to deploy script "${flow.syncName}"`, { error });
            await logCtx.failed();
            return { success, error, response: null };
        }

        idsToMarkAsInactive.push(...response.idsToMarkAsInactive);
        syncConfigs.push(response.syncConfig);
        const deployResult: SyncDeploymentResult = {
            name: flow.syncName,
            models: flow.models,
            version: response.syncConfig.version as string,
            providerConfigKey: flow.providerConfigKey,
            type: flow.type
        };

        if (response.syncConfig.version) {
            deployResult.version = response.syncConfig.version;
        }

        deployResults.push(deployResult);
    }

    if (syncConfigs.length === 0) {
        if (debug) {
            await logCtx.debug('All syncs were deleted');
        }
        await logCtx.success();

        return { success: true, error: null, response: { result: [], logCtx } };
    }

    const flowNames = flows.map((flow) => flow.syncName);

    try {
        const flowIds = await db.knex
            .from<SyncConfig>(TABLE)
            .insert(
                syncConfigs.map((syncConfig) => {
                    // We need to stringify before inserting
                    return { ...syncConfig, model_schema: JSON.stringify(syncConfig.model_schema) as any };
                })
            )
            .returning('id');

        const endpoints: DBSyncEndpointCreate[] = [];
        for (const [index, row] of flowIds.entries()) {
            const flow = flows[index];
            if (!flow) {
                continue;
            }

            endpoints.push(...endpointToSyncEndpoint(flow, row.id!));
        }

        if (endpoints.length > 0) {
            await db.knex.from<DBSyncEndpoint>(ENDPOINT_TABLE).insert(endpoints);
        }

        if (onEventScriptsByProvider) {
            const updated = await onEventScriptService.update({ environment, account, onEventScriptsByProvider });
            const result: SyncDeploymentResult[] = updated.map((u) => {
                return {
                    name: u.name,
                    version: u.version,
                    providerConfigKey: u.providerConfigKey,
                    type: 'on-event',
                    models: []
                };
            });
            deployResults.push(...result);
        }

        for (const id of idsToMarkAsInactive) {
            await switchActiveSyncConfig(id);
        }

        await logCtx.info(`Successfully deployed ${flows.length} script${flows.length > 1 ? 's' : ''}`, {
            nameOfType,
            count: flows.length,
            syncNames: flowNames,
            flows: flowsWithoutScript
        });
        await logCtx.success();

        const shortContent = `Successfully deployed the ${nameOfType}${flows.length > 1 ? 's' : ''} (${flowNames.join(', ')}).`;

        await telemetry.log(
            LogTypes.SYNC_DEPLOY_SUCCESS,
            shortContent,
            LogActionEnum.SYNC_DEPLOY,
            {
                environmentId: String(environment.id),
                syncName: flows.map((flow) => flow['syncName']).join(', '),
                accountId: String(account.id),
                providers: providers.join(', ')
            },
            'deploy_type:custom'
        );

        return { success: true, error: null, response: { result: deployResults, logCtx } };
    } catch (err) {
        await logCtx.error('Failed to deploy scripts', { error: err });
        await logCtx.failed();

        const shortContent = `Failure to deploy the syncs (${flows.map((flow) => flow.syncName).join(', ')}).`;

        await telemetry.log(
            LogTypes.SYNC_DEPLOY_FAILURE,
            shortContent,
            LogActionEnum.SYNC_DEPLOY,
            {
                environmentId: String(environment.id),
                syncName: flowNames.join(', '),
                accountId: String(account.id),
                providers: providers.join(', '),
                level: 'error'
            },
            'deploy_type:custom'
        );

        throw new NangoError('error_creating_sync_config');
    }
}

export async function upgradePreBuilt({
    environment,
    account,
    config,
    syncConfig,
    flow,
    logContextGetter
}: {
    environment: DBEnvironment;
    account: DBTeam;
    config: Config;
    // The current sync config
    syncConfig: SyncConfig;
    // The new version of the flow
    flow: NangoSyncConfig;
    logContextGetter: LogContextGetter;
}): Promise<Result<boolean | null>> {
    const logCtx = await logContextGetter.create({ operation: { type: 'deploy', action: 'prebuilt' } }, { account, environment });

    const { sync_name: name, is_public, type } = syncConfig;
    const { unique_key: provider_config_key, provider } = config;

    const file_location = await remoteFileService.copy(
        `${provider}/dist`,
        `${name}-${provider}.js`,
        `${env}/account/${account.id}/environment/${environment.id}/config/${syncConfig.nango_config_id}/${name}-v${flow.version}.js`,
        environment.id,
        `${name}-${provider_config_key}.js`
    );

    if (!file_location) {
        await logCtx.error('There was an error uploading the template', { isPublic: is_public, syncName: name, version: flow.version });
        await logCtx.failed();

        throw new NangoError('file_upload_error');
    }

    await remoteFileService.copy(
        provider,
        `${type}s/${name}.ts`,
        `${env}/account/${account.id}/environment/${environment.id}/config/${syncConfig.nango_config_id}/${name}.ts`,
        environment.id,
        `${name}.ts`
    );

    const now = new Date();

    const flowData: SyncConfig = {
        ...syncConfig,
        created_at: now,
        updated_at: now,
        version: flow.version!,
        file_location,
        model_schema: JSON.stringify(flow.models) as any,
        metadata: flow.metadata || {},
        auto_start: flow.auto_start === true,
        track_deletes: flow.track_deletes === true,
        models: flow.returns
    };
    delete flowData.id;

    try {
        const [newSyncConfig] = await db.knex.from<SyncConfig>(TABLE).insert(flowData).returning('*');

        if (!newSyncConfig?.id) {
            throw new NangoError('error_creating_sync_config');
        }
        const newSyncConfigId = newSyncConfig.id;
        const endpoints: DBSyncEndpointCreate[] = [];

        // update sync_config_id in syncs table
        await db.knex.from<Sync>(SYNC_TABLE).update({ sync_config_id: newSyncConfigId }).where('sync_config_id', syncConfig.id);

        // update endpoints
        if (flow.endpoints) {
            flow.endpoints.forEach(({ method, path, group }, endpointIndex) => {
                const res: DBSyncEndpointCreate = {
                    sync_config_id: newSyncConfigId,
                    method,
                    path,
                    group_name: group || null,
                    created_at: now,
                    updated_at: now
                };
                const model = flowData.models[endpointIndex];
                if (model) {
                    res.model = model;
                }
                endpoints.push(res);
            });
        }

        if (endpoints.length > 0) {
            await db.knex.from<DBSyncEndpoint>(ENDPOINT_TABLE).insert(endpoints);
        }

        await db.knex.from<SyncConfig>(TABLE).update({ active: false }).whereIn('id', [syncConfig.id]);

        await logCtx.info('Successfully deployed', { nameOfType, configs: name });
        await logCtx.success();

        await telemetry.log(
            LogTypes.SYNC_DEPLOY_SUCCESS,
            `Successfully upgraded the ${flow.type} (${name}).`,
            LogActionEnum.SYNC_DEPLOY,
            {
                environmentId: String(environment.id),
                syncName: name,
                accountId: String(account.id),
                integrations: provider,
                preBuilt: 'true',
                is_public: 'true'
            },
            `deploy_type:public.template`
        );

        return Ok(true);
    } catch (err) {
        const content = `Failed to deploy the ${flow.type} ${flow.name}.`;

        await logCtx.error('Failed to upgrade', { type: flow.type, name: flow.name, error: err });
        await logCtx.failed();

        await telemetry.log(
            LogTypes.SYNC_DEPLOY_FAILURE,
            content,
            LogActionEnum.SYNC_DEPLOY,
            {
                environmentId: String(environment.id),
                syncName: flow.name,
                accountId: String(account.id),
                integration: provider,
                preBuilt: 'true',
                is_public: 'true',
                level: 'error'
            },
            `deploy_type:public.template`
        );

        throw new NangoError('error_creating_sync_config');
    }
}

export async function deployPreBuilt({
    environment,
    account,
    configs,
    logContextGetter,
    orchestrator
}: {
    environment: DBEnvironment;
    account: DBTeam;
    configs: IncomingPreBuiltFlowConfig[];
    logContextGetter: LogContextGetter;
    orchestrator: Orchestrator;
}): Promise<ServiceResponse<SyncConfigResult | null>> {
    const [firstConfig] = configs;
    if (!firstConfig || !firstConfig.public_route) {
        return { success: false, error: new NangoError('no_config'), response: null };
    }

    const providerConfigKeys = [];

    const logCtx = await logContextGetter.create({ operation: { type: 'deploy', action: 'prebuilt' } }, { account, environment });

    const idsToMarkAsInactive = [];
    const insertData: SyncConfig[] = [];
    let nango_config_id: number;
    let provider_config_key: string;

    // this is a public template so copy it from the public location
    // We might not want to do this as it just overrides the root nango.yaml
    // which means we overwrite any custom nango.yaml that the user has
    await remoteFileService.copy(
        firstConfig.public_route,
        nangoConfigFile,
        `${env}/account/${account.id}/environment/${environment.id}/${nangoConfigFile}`,
        environment.id,
        nangoConfigFile
    );

    const flowReturnData: SyncDeploymentResult[] = [];

    for (const config of configs) {
        if (!config.providerConfigKey) {
            // TODO: this is a critical bug if there are multiple integration with the same provider
            const providerLookup = await configService.getConfigIdByProvider(config.provider, environment.id);
            if (!providerLookup) {
                const error = new NangoError('provider_not_on_account');

                return { success: false, error, response: null };
            }
            ({ id: nango_config_id, unique_key: provider_config_key } = providerLookup);
        } else {
            const providerConfig = await configService.getProviderConfig(config.providerConfigKey, environment.id);

            if (!providerConfig) {
                const error = new NangoError('unknown_provider_config', { providerConfigKey: config.providerConfigKey });

                return { success: false, error, response: null };
            }
            provider_config_key = config.providerConfigKey;
            nango_config_id = providerConfig.id as number;
        }

        providerConfigKeys.push(provider_config_key);

        const { type, models, auto_start, runs, model_schema: model_schema_string, is_public, attributes = {}, metadata = {} } = config;
        let { input } = config;
        const sync_name = config.name || config.syncName;

        if (type === 'sync' && !runs) {
            const error = new NangoError('missing_required_fields_on_deploy');

            return { success: false, error, response: null };
        }

        if (!sync_name || !nango_config_id) {
            const error = new NangoError('missing_required_fields_on_deploy');

            return { success: false, error, response: null };
        }

        const previousSyncAndActionConfig = await getSyncAndActionConfigByParams(environment.id, sync_name, provider_config_key);
        let bumpedVersion = '';

        if (previousSyncAndActionConfig) {
            bumpedVersion = increment(previousSyncAndActionConfig.version as string | number).toString();

            if (runs) {
                const syncs = await getSyncsByProviderConfigAndSyncName(environment.id, provider_config_key, sync_name);
                for (const sync of syncs) {
                    const interval = sync.frequency || runs;
                    const res = await orchestrator.updateSyncFrequency({
                        syncId: sync.id,
                        interval,
                        syncName: sync_name,
                        environmentId: environment.id,
                        logCtx
                    });
                    if (res.isErr()) {
                        const error = new NangoError('error_updating_sync_schedule_frequency', {
                            syncId: sync.id,
                            environmentId: environment.id,
                            interval
                        });
                        return { success: false, error, response: null };
                    }
                }
            }
        }

        const version = bumpedVersion || '0.0.1';

        const jsFile = typeof config.fileBody === 'string' ? config.fileBody : config.fileBody?.js;
        let file_location: string | null = null;
        if (is_public) {
            file_location = await remoteFileService.copy(
                `${config.public_route}/dist`,
                `${sync_name}-${config.provider}.js`,
                `${env}/account/${account.id}/environment/${environment.id}/config/${nango_config_id}/${sync_name}-v${version}.js`,
                environment.id,
                `${sync_name}-${provider_config_key}.js`
            );
        } else {
            file_location = await remoteFileService.upload(
                jsFile as string,
                `${env}/account/${account.id}/environment/${environment.id}/config/${nango_config_id}/${sync_name}-v${version}.js`,
                environment.id
            );
        }

        if (!file_location) {
            await logCtx.error('There was an error uploading the template', { isPublic: is_public, syncName: sync_name, version });
            await logCtx.failed();

            throw new NangoError('file_upload_error');
        }

        const flowJsonSchema: JSONSchema7 = {
            definitions: {}
        };

        const flowModels = Array.isArray(models) ? models : [models];

        if (is_public) {
            await remoteFileService.copy(
                config.public_route,
                `${type}s/${sync_name}.ts`,
                `${env}/account/${account.id}/environment/${environment.id}/config/${nango_config_id}/${sync_name}.ts`,
                environment.id,
                `${sync_name}.ts`
            );
            // fetch the json schema so we have type checking
            const jsonSchema = await remoteFileService.getPublicTemplateJsonSchemaFile(firstConfig.public_route, environment.id);

            if (jsonSchema) {
                const parsedJsonSchema = JSON.parse(jsonSchema);
                for (const model of flowModels) {
                    const schema = parsedJsonSchema.definitions![model];
                    if (!schema) {
                        const error = new NangoError('deploy_missing_json_schema_model', `json_schema doesn't contain model "${model}"`);

                        return { success: false, error, response: null };
                    }
                    flowJsonSchema.definitions![model] = schema;
                }
            }
        } else {
            if (typeof config.fileBody === 'object' && config.fileBody.ts) {
                await remoteFileService.upload(
                    config.fileBody.ts,
                    `${env}/account/${account.id}/environment/${environment.id}/config/${nango_config_id}/${sync_name}.ts`,
                    environment.id
                );
            }
        }

        const oldConfigs = await getSyncAndActionConfigsBySyncNameAndConfigId(environment.id, nango_config_id, sync_name);

        if (oldConfigs.length > 0) {
            const ids = oldConfigs.map((oldConfig: SyncConfig) => oldConfig.id as number);
            idsToMarkAsInactive.push(...ids);
        }

        const created_at = new Date();

        const model_schema = typeof model_schema_string === 'string' ? JSON.parse(model_schema_string) : model_schema_string;

        if (input && Object.keys(input).length === 0) {
            input = undefined;
        }

        if (input && typeof input !== 'string' && input.name) {
            model_schema.push(input);
        }

        const flowData: SyncConfig = {
            created_at,
            sync_name,
            nango_config_id,
            file_location,
            version,
            models: flowModels,
            active: true,
            runs,
            input: input && typeof input !== 'string' ? String(input.name) : input,
            model_schema: JSON.stringify(model_schema) as unknown as SyncModelSchema[],
            environment_id: environment.id,
            deleted: false,
            track_deletes: config.track_deletes,
            type,
            auto_start: auto_start === false ? false : true,
            attributes,
            metadata,
            pre_built: true,
            is_public,
            enabled: true,
            webhook_subscriptions: null,
            models_json_schema: flowJsonSchema,
            updated_at: new Date()
        };

        insertData.push(flowData);

        flowReturnData.push({
            ...config,
            providerConfigKey: provider_config_key,
            ...flowData,
            last_deployed: created_at,
            input: typeof input !== 'string' ? (input as SyncModelSchema) : String(input),
            models: model_schema
        });
    }

    const isPublic = configs.every((config) => config.is_public);

    try {
        const syncConfigs = await db.knex.from<SyncConfig>(TABLE).insert(insertData).returning('*');

        flowReturnData.forEach((flow, index) => {
            const row = syncConfigs[index];
            if (row) {
                flow.id = row.id;
            }
        });

        const endpoints: DBSyncEndpointCreate[] = [];
        for (const [index, row] of syncConfigs.entries()) {
            const flow = configs[index];
            if (!flow) {
                continue;
            }

            endpoints.push(...endpointToSyncEndpoint(flow, row.id!));
        }

        if (endpoints.length > 0) {
            await db.knex.from<DBSyncEndpoint>(ENDPOINT_TABLE).insert(endpoints);
        }

        for (const id of idsToMarkAsInactive) {
            await switchActiveSyncConfig(id);
        }

        let content;
        const names = configs.map((config) => config.name || config.syncName);
        if (isPublic) {
            content = `Successfully deployed the ${nameOfType}${configs.length === 1 ? '' : 's'} template${configs.length === 1 ? '' : 's'} (${names.join(
                ', '
            )}).`;
        } else {
            content = `There ${configs.length === 1 ? 'was' : 'were'} ${configs.length} ${nameOfType}${configs.length === 1 ? '' : 's'} private template${
                configs.length === 1 ? '' : 's'
            } (${names.join(', ')}) deployed to your account by a Nango admin.`;
        }

        await logCtx.info('Successfully deployed', { nameOfType, configs: names });
        await logCtx.success();

        await telemetry.log(
            LogTypes.SYNC_DEPLOY_SUCCESS,
            content,
            LogActionEnum.SYNC_DEPLOY,
            {
                environmentId: String(environment.id),
                syncName: configs.map((config) => config.name).join(', '),
                accountId: String(account.id),
                integrations: configs.map((config) => config.provider).join(', '),
                preBuilt: 'true',
                is_public: isPublic ? 'true' : 'false'
            },
            `deploy_type:${isPublic ? 'public.' : 'private.'}template`
        );

        return { success: true, error: null, response: { result: flowReturnData, logCtx } };
    } catch (err) {
        const content = `Failed to deploy the ${nameOfType}${configs.length === 1 ? '' : 's'} (${configs.map((config) => config.name).join(', ')}).`;

        await logCtx.error('Failed to deploy', { nameOfType, configs: configs.map((config) => config.name), error: err });
        await logCtx.failed();

        await telemetry.log(
            LogTypes.SYNC_DEPLOY_FAILURE,
            content,
            LogActionEnum.SYNC_DEPLOY,
            {
                environmentId: String(environment.id),
                syncName: configs.map((config) => config.name).join(', '),
                accountId: String(account.id),
                integration: configs.map((config) => config.provider).join(', '),
                preBuilt: 'true',
                is_public: isPublic ? 'true' : 'false',
                level: 'error'
            },
            `deploy_type:${isPublic ? 'public.' : 'private.'}template`
        );

        throw new NangoError('error_creating_sync_config');
    }
}

async function compileDeployInfo({
    flow,
    jsonSchema,
    env,
    environment_id,
    account,
    debug,
    logCtx,
    orchestrator
}: {
    flow: FlowParsed;
    jsonSchema?: JSONSchema7 | undefined;
    env: string;
    environment_id: number;
    account: DBTeam;
    debug: boolean;
    logCtx: LogContext;
    orchestrator: Orchestrator;
}): Promise<ServiceResponse<{ idsToMarkAsInactive: number[]; syncConfig: SyncConfig }>> {
    const {
        syncName,
        providerConfigKey,
        fileBody,
        models,
        runs,
        version: optionalVersion,
        model_schema,
        type = 'sync',
        track_deletes,
        auto_start,
        attributes = {},
        metadata = {}
    } = flow;
    const config = await configService.getProviderConfig(providerConfigKey, environment_id);

    if (!config) {
        const error = new NangoError('unknown_provider_config', { providerConfigKey });
        await logCtx.error(error.message);

        return { success: false, error, response: null };
    }

    const previousSyncAndActionConfig = await getSyncAndActionConfigByParams(environment_id, syncName, providerConfigKey);
    let bumpedVersion = '';

    if (previousSyncAndActionConfig) {
        bumpedVersion = increment(previousSyncAndActionConfig.version as string | number).toString();

        if (debug) {
            await logCtx.debug('A previous sync config was found', { syncName, prevVersion: previousSyncAndActionConfig.version });
        }

        if (runs) {
            const syncs = await getSyncsByProviderConfigAndSyncName(environment_id, providerConfigKey, syncName);

            for (const sync of syncs) {
                const interval = sync.frequency || runs;
                const res = await orchestrator.updateSyncFrequency({
                    syncId: sync.id,
                    interval,
                    syncName,
                    environmentId: environment_id,
                    logCtx
                });
                if (res.isErr()) {
                    const error = new NangoError('error_updating_sync_schedule_frequency', {
                        syncId: sync.id,
                        environmentId: environment_id,
                        interval
                    });
                    return { success: false, error, response: null };
                }
            }
        }
    }

    const version = optionalVersion || bumpedVersion || '1';
    const idsToMarkAsInactive: number[] = [];

    const jsFile = typeof fileBody === 'string' ? fileBody : fileBody.js;
    const file_location = (await remoteFileService.upload(
        jsFile,
        `${env}/account/${account.id}/environment/${environment_id}/config/${config.id}/${syncName}-v${version}.js`,
        environment_id
    )) as string;

    if (typeof fileBody === 'object' && fileBody.ts) {
        await remoteFileService.upload(
            fileBody.ts,
            `${env}/account/${account.id}/environment/${environment_id}/config/${config.id}/${syncName}.ts`,
            environment_id
        );
    }

    if (!file_location) {
        await logCtx.error('There was an error uploading the sync file', { fileName: `${syncName}-v${version}.js` });

        // this is a platform error so throw this
        throw new NangoError('file_upload_error');
    }

    const oldConfigs = await getSyncAndActionConfigsBySyncNameAndConfigId(environment_id, config.id as number, syncName);
    let lastSyncWasEnabled = true;

    if (oldConfigs.length > 0) {
        const ids = oldConfigs.map((oldConfig: SyncConfig) => oldConfig.id as number);
        idsToMarkAsInactive.push(...ids);
        const lastConfig = oldConfigs[oldConfigs.length - 1];
        if (lastConfig) {
            lastSyncWasEnabled = lastConfig.enabled;
        }
    }

    let shouldCap = false;

    if (account.is_capped) {
        // if there are too many connections for this sync then we need to also
        // mark it as disabled
        shouldCap = await connectionService.shouldCapUsage({ providerConfigKey, environmentId: environment_id, type: 'deploy' });
    }

    // Only store relevant JSON schema
    const flowJsonSchema: JSONSchema7 = {
        definitions: {}
    };
    if (jsonSchema) {
        for (const model of model_schema) {
            const schema = jsonSchema.definitions![model.name];
            if (!schema) {
                return {
                    success: false,
                    error: new NangoError('deploy_missing_json_schema_model', `json_schema doesn't contain model "${model.name}"`),
                    response: null
                };
            }

            flowJsonSchema.definitions![model.name] = schema;
            const models = findModelInModelSchema(model.fields);

            // Fields that may contain other Model
            for (const modelName of models) {
                const schema = jsonSchema.definitions![modelName];
                if (!schema) {
                    return {
                        success: false,
                        error: new NangoError('deploy_missing_json_schema_model', `json_schema doesn't contain model "${modelName}"`),
                        response: null
                    };
                }

                flowJsonSchema.definitions![modelName] = schema;
            }
        }
    }

    return {
        success: true,
        error: null,
        response: {
            idsToMarkAsInactive,
            syncConfig: {
                environment_id,
                nango_config_id: config.id as number,
                sync_name: syncName,
                type,
                models,
                version,
                track_deletes: track_deletes || false,
                auto_start: auto_start === false ? false : true,
                attributes,
                metadata,
                file_location,
                runs,
                active: true,
                model_schema: model_schema as unknown as SyncModelSchema[],
                input: typeof flow.input === 'string' ? flow.input : flow.input ? flow.input.name : undefined,
                sync_type: flow.sync_type as SyncType,
                webhook_subscriptions: flow.webhookSubscriptions || [],
                enabled: lastSyncWasEnabled && !shouldCap,
                models_json_schema: jsonSchema ? flowJsonSchema : null,
                created_at: new Date(),
                updated_at: new Date()
            }
        }
    };
}

async function switchActiveSyncConfig(oldSyncConfigId: number): Promise<void> {
    await db.knex.transaction(async (trx) => {
        // mark sync config as inactive
        await trx.from<SyncConfig>(TABLE).update({ active: false }).where({ id: oldSyncConfigId });

        // update sync_config_id in syncs table to point to active sync config
        await trx.raw(
            `
            UPDATE nango._nango_syncs
            SET sync_config_id = (
                SELECT active_config.id
                FROM nango._nango_sync_configs as old_config
                JOIN nango._nango_sync_configs as active_config
                    ON old_config.sync_name = active_config.sync_name
                    AND old_config.nango_config_id = active_config.nango_config_id
                    AND old_config.environment_id = active_config.environment_id
                WHERE old_config.id = ?
                    AND active_config.active = true
            )
            WHERE sync_config_id = ?`,
            [oldSyncConfigId, oldSyncConfigId]
        );
    });
}

function findModelInModelSchema(fields: NangoModel['fields']) {
    const models = new Set<string>();
    for (const field of fields) {
        if (field.model) {
            models.add(field.value as string);
        }
        if (Array.isArray(field.value)) {
            const res = findModelInModelSchema(field.value);
            if (res.size > 0) {
                res.forEach((name) => models.add(name));
            }
        }
    }

    return models;
}

function endpointToSyncEndpoint(flow: Pick<CleanedIncomingFlowConfig, 'endpoints' | 'models'>, sync_config_id: number) {
    const endpoints: DBSyncEndpointCreate[] = [];
    for (const [endpointIndex, endpoint] of flow.endpoints.entries()) {
        const res: DBSyncEndpointCreate = {
            sync_config_id,
            method: endpoint.method,
            path: endpoint.path,
            group_name: endpoint.group || null,
            created_at: new Date(),
            updated_at: new Date()
        };
        const model = flow.models[endpointIndex];
        if (model) {
            res.model = model;
        }
        endpoints.push(res);
    }

    return endpoints;
}
