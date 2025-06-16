import db, { dbNamespace } from '@nangohq/database';
import { nangoConfigFile } from '@nangohq/nango-yaml';
import { Err, Ok, env, filterJsonSchemaForModels } from '@nangohq/utils';

import configService from '../../config.service.js';
import remoteFileService from '../../file/remote.service.js';
import { getSyncsByProviderConfigKey } from '../sync.service.js';
import { getSyncAndActionConfigByParams, getSyncAndActionConfigsBySyncNameAndConfigId, increment } from './config.service.js';
import { NangoError } from '../../../utils/error.js';
import connectionService from '../../connection.service.js';
import { switchActiveSyncConfig } from '../../deploy/utils.js';
import { onEventScriptService } from '../../on-event-scripts.service.js';

import type { Orchestrator } from '../../../clients/orchestrator.js';
import type { ServiceResponse } from '../../../models/Generic.js';
import type { Config } from '../../../models/Provider.js';
import type { Sync } from '../../../models/Sync.js';
import type { LogContext, LogContextGetter } from '@nangohq/logs';
import type {
    CLIDeployFlowConfig,
    CleanedIncomingFlowConfig,
    DBEnvironment,
    DBPlan,
    DBSyncConfig,
    DBSyncConfigInsert,
    DBSyncEndpoint,
    DBSyncEndpointCreate,
    DBTeam,
    HTTP_METHOD,
    NangoSyncConfig,
    NangoSyncEndpointV2,
    OnEventScriptsByProvider,
    SyncDeploymentResult
} from '@nangohq/types';
import type { Result } from '@nangohq/utils';
import type { JSONSchema7 } from 'json-schema';

const TABLE = dbNamespace + 'sync_configs';
const SYNC_TABLE = dbNamespace + 'syncs';
const ENDPOINT_TABLE = dbNamespace + 'sync_endpoints';

const nameOfType = 'sync/action';

type FlowParsed = CleanedIncomingFlowConfig;
type FlowWithoutScript = Omit<FlowParsed, 'fileBody'>;

interface SyncConfigResult {
    result: SyncDeploymentResult[];
    logCtx: LogContext;
}

/**
 * Transform received incoming flow from the CLI to an internally standard object
 */
export function cleanIncomingFlow(flowConfigs: CLIDeployFlowConfig[]): CleanedIncomingFlowConfig[] {
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
    plan,
    flows,
    jsonSchema,
    onEventScriptsByProvider,
    nangoYamlBody,
    logContextGetter,
    orchestrator,
    debug,
    sdkVersion
}: {
    environment: DBEnvironment;
    account: DBTeam;
    plan: DBPlan | null;
    flows: CleanedIncomingFlowConfig[];
    jsonSchema?: JSONSchema7 | undefined;
    onEventScriptsByProvider?: OnEventScriptsByProvider[] | undefined;
    nangoYamlBody: string;
    logContextGetter: LogContextGetter;
    orchestrator: Orchestrator;
    debug?: boolean;
    sdkVersion: string | undefined;
}): Promise<ServiceResponse<SyncConfigResult | null>> {
    const logCtx = await logContextGetter.create({ operation: { type: 'deploy', action: 'custom' } }, { account, environment });

    if (nangoYamlBody) {
        await remoteFileService.upload({
            content: nangoYamlBody,
            destinationPath: `${env}/account/${account.id}/environment/${environment.id}/${nangoConfigFile}`,
            destinationLocalPath: nangoConfigFile
        });
    }

    const deployResults: SyncDeploymentResult[] = [];
    const flowsWithoutScript: FlowWithoutScript[] = [];
    const idsToMarkAsInactive: number[] = [];
    const syncConfigs: DBSyncConfigInsert[] = [];
    for (const flow of flows) {
        const { fileBody: _fileBody, ...rest } = flow;
        flowsWithoutScript.push({ ...rest });

        const { success, error, response } = await compileDeployInfo({
            flow,
            jsonSchema,
            env,
            environment_id: environment.id,
            account,
            plan,
            debug: Boolean(debug),
            logCtx,
            orchestrator,
            sdkVersion
        });

        if (!success || !response) {
            void logCtx.error(`Failed to deploy script "${flow.syncName}"`, { error });
            await logCtx.failed();
            return { success, error, response: null };
        }

        idsToMarkAsInactive.push(...response.idsToMarkAsInactive);
        syncConfigs.push(response.syncConfig);
        const deployResult: SyncDeploymentResult = {
            name: flow.syncName,
            models: flow.models,
            version: response.syncConfig.version,
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
            void logCtx.debug('All syncs were deleted');
        }
        await logCtx.success();

        return { success: true, error: null, response: { result: [], logCtx } };
    }

    const flowNames = flows.map((flow) => flow.syncName);

    try {
        const flowIds = await db.knex.from<DBSyncConfig>(TABLE).insert(syncConfigs).returning('id');

        const endpoints: DBSyncEndpointCreate[] = [];
        for (const [index, row] of flowIds.entries()) {
            const flow = flows[index];
            if (!flow) {
                continue;
            }

            endpoints.push(...endpointToSyncEndpoint(flow, row.id));
        }

        if (endpoints.length > 0) {
            await db.knex.from<DBSyncEndpoint>(ENDPOINT_TABLE).insert(endpoints);
        }

        if (onEventScriptsByProvider) {
            const updated = await onEventScriptService.update({ environment, account, onEventScriptsByProvider, sdkVersion });
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

        void logCtx.info(`Successfully deployed ${flows.length} script${flows.length > 1 ? 's' : ''}`, {
            nameOfType,
            count: flows.length,
            syncNames: flowNames,
            flows: flowsWithoutScript
        });
        await logCtx.success();

        return { success: true, error: null, response: { result: deployResults, logCtx } };
    } catch (err) {
        void logCtx.error('Failed to deploy scripts', { error: err });
        await logCtx.failed();

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
    syncConfig: DBSyncConfig;
    // The new version of the flow
    flow: NangoSyncConfig;
    logContextGetter: LogContextGetter;
}): Promise<Result<boolean | null>> {
    const logCtx = await logContextGetter.create({ operation: { type: 'deploy', action: 'prebuilt' } }, { account, environment });

    const { sync_name: name, is_public, type } = syncConfig;
    const { unique_key: provider_config_key, provider } = config;
    const remoteBasePath = `${env}/account/${account.id}/environment/${environment.id}/config/${syncConfig.nango_config_id}`;

    void logCtx.info(`Upgrading ${syncConfig.sync_name} to version ${flow.version}`);

    const file_location = await remoteFileService.copy({
        sourcePath: `${provider}/dist/${name}-${provider}.js`,
        destinationPath: `${remoteBasePath}/${name}-v${flow.version}.js`,
        destinationLocalPath: `dist/${name}-${provider_config_key}.js`
    });
    if (!file_location) {
        void logCtx.error('There was an error uploading the template', { isPublic: is_public, syncName: name, version: flow.version });
        await logCtx.failed();

        return Err(new NangoError('file_upload_error'));
    }

    const copy = await remoteFileService.copy({
        sourcePath: `${provider}/${type}s/${name}.ts`,
        destinationPath: `${remoteBasePath}/${name}.ts`,
        destinationLocalPath: `${provider_config_key}/${type}s/${name}.ts`
    });
    if (!copy) {
        void logCtx.error('There was an error uploading the template', { isPublic: is_public, syncName: name, version: flow.version });
        await logCtx.failed();

        return Err(new NangoError('file_upload_error'));
    }

    const now = new Date();

    const { id, ...restWithoutId } = syncConfig;
    const flowData: DBSyncConfigInsert = {
        ...restWithoutId,
        created_at: now,
        updated_at: now,
        version: flow.version!,
        file_location,
        metadata: flow.metadata || {},
        auto_start: flow.auto_start === true,
        track_deletes: flow.track_deletes === true,
        models: flow.returns
    };

    try {
        const [newSyncConfig] = await db.knex.from<DBSyncConfig>(TABLE).insert(flowData).returning('*');

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

        await db.knex.from<DBSyncConfig>(TABLE).update({ active: false }).whereIn('id', [syncConfig.id]);

        void logCtx.info('Successfully deployed', { nameOfType, configs: name });
        await logCtx.success();

        return Ok(true);
    } catch (err) {
        void logCtx.error('Failed to upgrade', { type: flow.type, name: flow.name, error: err });
        await logCtx.failed();

        throw new NangoError('error_creating_sync_config');
    }
}

async function compileDeployInfo({
    flow,
    jsonSchema,
    env,
    environment_id,
    account,
    plan,
    debug,
    logCtx,
    orchestrator,
    sdkVersion
}: {
    flow: FlowParsed;
    jsonSchema?: JSONSchema7 | undefined;
    env: string;
    environment_id: number;
    account: DBTeam;
    plan: DBPlan | null;
    debug: boolean;
    logCtx: LogContext;
    orchestrator: Orchestrator;
    sdkVersion: string | undefined;
}): Promise<ServiceResponse<{ idsToMarkAsInactive: number[]; syncConfig: DBSyncConfigInsert }>> {
    const {
        syncName,
        providerConfigKey,
        fileBody,
        models,
        runs,
        version: optionalVersion,
        type = 'sync',
        track_deletes,
        auto_start,
        attributes = {},
        metadata = {}
    } = flow;
    const config = await configService.getProviderConfig(providerConfigKey, environment_id);

    if (!config) {
        const error = new NangoError('unknown_provider_config', { providerConfigKey });
        void logCtx.error(error.message);

        return { success: false, error, response: null };
    }

    const previousSyncAndActionConfig = await getSyncAndActionConfigByParams(environment_id, syncName, providerConfigKey, false);
    let bumpedVersion = '';

    if (previousSyncAndActionConfig) {
        bumpedVersion = increment(previousSyncAndActionConfig.version as string | number).toString();

        if (debug) {
            void logCtx.debug('A previous sync config was found', { syncName, prevVersion: previousSyncAndActionConfig.version });
        }

        if (runs) {
            const syncs = await getSyncsByProviderConfigKey({ environmentId: environment_id, providerConfigKey, filter: [{ syncName, syncVariant: 'base' }] });

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
    const file_location = (await remoteFileService.upload({
        content: jsFile,
        destinationPath: `${env}/account/${account.id}/environment/${environment_id}/config/${config.id}/${syncName}-v${version}.js`,
        destinationLocalPath: `${syncName}-${providerConfigKey}.js`
    })) as string;

    if (typeof fileBody === 'object' && fileBody.ts) {
        await remoteFileService.upload({
            content: fileBody.ts,
            destinationPath: `${env}/account/${account.id}/environment/${environment_id}/config/${config.id}/${syncName}.ts`,
            destinationLocalPath: `${providerConfigKey}/${flow.type}s/${syncName}.ts`
        });
    }

    if (!file_location) {
        void logCtx.error('There was an error uploading the sync file', { fileName: `${syncName}-v${version}.js` });

        // this is a platform error so throw this
        throw new NangoError('file_upload_error');
    }

    const oldConfigs = await getSyncAndActionConfigsBySyncNameAndConfigId(environment_id, config.id as number, syncName);
    let lastSyncWasEnabled = true;

    if (oldConfigs.length > 0) {
        const ids = oldConfigs.map((oldConfig: DBSyncConfig) => oldConfig.id);
        idsToMarkAsInactive.push(...ids);
        const lastConfig = oldConfigs[oldConfigs.length - 1];
        if (lastConfig) {
            lastSyncWasEnabled = lastConfig.enabled;
        }
    }

    // if there are too many connections for this sync then we need to also
    // mark it as disabled
    const shouldCap = await connectionService.shouldCapUsage({
        providerConfigKey,
        environmentId: environment_id,
        type: 'deploy',
        team: account,
        plan
    });

    let models_json_schema: JSONSchema7 | null = null;
    if (jsonSchema) {
        const allModels = [...models, flow.input].filter(Boolean) as string[];
        const result = filterJsonSchemaForModels(jsonSchema, allModels);
        if (result.isErr()) {
            return { success: false, error: new NangoError('deploy_missing_json_schema_model', result.error), response: null };
        }
        models_json_schema = result.value;
    }

    return {
        success: true,
        error: null,
        response: {
            idsToMarkAsInactive,
            syncConfig: {
                is_public: false,
                pre_built: false,
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
                input: typeof flow.input === 'string' ? flow.input : null,
                sync_type: flow.sync_type || null,
                webhook_subscriptions: flow.webhookSubscriptions || [],
                enabled: lastSyncWasEnabled && !shouldCap,
                model_schema: null,
                models_json_schema,
                sdk_version: sdkVersion || null,
                created_at: new Date(),
                updated_at: new Date()
            }
        }
    };
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
