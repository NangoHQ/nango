import db, { dbNamespace } from '@nangohq/database';
import configService from '../../config.service.js';
import remoteFileService from '../../file/remote.service.js';
import { getSyncsByProviderConfigAndSyncName } from '../sync.service.js';
import connectionService from '../../connection.service.js';
import { LogActionEnum } from '../../../models/Activity.js';
import type { HTTP_VERB, ServiceResponse } from '../../../models/Generic.js';
import type { SyncModelSchema, SyncConfig, SyncDeploymentResult, SyncConfigResult, SyncEndpoint, SyncType } from '../../../models/Sync.js';
import type { IncomingFlowConfig, IncomingPreBuiltFlowConfig, NangoModel, PostConnectionScriptByProvider } from '@nangohq/types';
import { postConnectionScriptService } from '../post-connection.service.js';
import { NangoError } from '../../../utils/error.js';
import telemetry, { LogTypes } from '../../../utils/telemetry.js';
import { env } from '@nangohq/utils';
import { nangoConfigFile } from '../../nango-config.service.js';
import { getSyncAndActionConfigByParams, increment, getSyncAndActionConfigsBySyncNameAndConfigId } from './config.service.js';
import type { LogContext, LogContextGetter } from '@nangohq/logs';
import type { Environment } from '../../../models/Environment.js';
import type { Account } from '../../../models/Admin.js';
import type { Orchestrator } from '../../../clients/orchestrator.js';
import type { Merge } from 'type-fest';

const TABLE = dbNamespace + 'sync_configs';
const ENDPOINT_TABLE = dbNamespace + 'sync_endpoints';

const nameOfType = 'sync/action';

type FlowParsed = Merge<IncomingFlowConfig, { model_schema: NangoModel[] }>;
type FlowWithoutScript = Omit<FlowParsed, 'fileBody'>;

export async function deploy({
    environment,
    account,
    flows,
    postConnectionScriptsByProvider,
    nangoYamlBody,
    logContextGetter,
    orchestrator,
    debug
}: {
    environment: Environment;
    account: Account;
    flows: IncomingFlowConfig[];
    postConnectionScriptsByProvider: PostConnectionScriptByProvider[];
    nangoYamlBody: string;
    logContextGetter: LogContextGetter;
    orchestrator: Orchestrator;
    debug?: boolean;
}): Promise<ServiceResponse<SyncConfigResult | null>> {
    const providers = flows.map((flow) => flow.providerConfigKey);

    const logCtx = await logContextGetter.create(
        { operation: { type: 'deploy', action: 'custom' }, message: 'Deploying custom syncs' },
        { account, environment }
    );

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
        deployResults.push({
            name: flow.syncName,
            models: flow.models,
            providerConfigKey: flow.providerConfigKey,
            type: flow.type
        });
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

        const endpoints: SyncEndpoint[] = [];

        // TODO: fix this
        flowIds.forEach((row, index) => {
            const flow = flows[index] as IncomingFlowConfig;
            if (flow.endpoints && row.id) {
                flow.endpoints.forEach((endpoint, endpointIndex: number) => {
                    const method = Object.keys(endpoint)[0] as HTTP_VERB;
                    const path = endpoint[method] as string;
                    const res: SyncEndpoint = {
                        sync_config_id: row.id as number,
                        method,
                        path
                    };
                    const model = flow.models[endpointIndex] as string;
                    if (model) {
                        res.model = model;
                    }
                    endpoints.push(res);
                });
            }
        });

        if (endpoints.length > 0) {
            await db.knex.from<SyncEndpoint>(ENDPOINT_TABLE).insert(endpoints);
        }

        if (postConnectionScriptsByProvider.length > 0) {
            await postConnectionScriptService.update({ environment, account, postConnectionScriptsByProvider });
        }

        if (idsToMarkAsInactive.length > 0) {
            await db.knex.from<SyncConfig>(TABLE).update({ active: false }).whereIn('id', idsToMarkAsInactive);
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
    } catch (e) {
        await logCtx.error('Failed to deploy scripts', { error: e });
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

export async function deployPreBuilt({
    environment,
    account,
    configs,
    nangoYamlBody,
    logContextGetter,
    orchestrator
}: {
    environment: Environment;
    account: Account;
    configs: IncomingPreBuiltFlowConfig[];
    nangoYamlBody: string;
    logContextGetter: LogContextGetter;
    orchestrator: Orchestrator;
}): Promise<ServiceResponse<SyncConfigResult | null>> {
    const [firstConfig] = configs;

    const providerConfigKeys = [];

    const logCtx = await logContextGetter.create(
        { operation: { type: 'deploy', action: 'prebuilt' }, message: 'Deploying pre-built flow' },
        { account, environment }
    );

    const idsToMarkAsInvactive = [];
    const insertData: SyncConfig[] = [];
    let nango_config_id: number;
    let provider_config_key: string;

    if (nangoYamlBody) {
        await remoteFileService.upload(nangoYamlBody, `${env}/account/${account.id}/environment/${environment.id}/${nangoConfigFile}`, environment.id);
    } else {
        // this is a public template so copy it from the public location
        await remoteFileService.copy(
            firstConfig?.public_route as string,
            nangoConfigFile,
            `${env}/account/${account.id}/environment/${environment.id}/${nangoConfigFile}`,
            environment.id,
            nangoConfigFile
        );
    }

    const flowReturnData: SyncDeploymentResult[] = [];

    for (const config of configs) {
        if (!config.providerConfigKey) {
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
                const syncsConfig = await getSyncsByProviderConfigAndSyncName(environment.id, provider_config_key, sync_name);
                for (const syncConfig of syncsConfig) {
                    const interval = syncConfig.frequency || runs;
                    const res = await orchestrator.updateSyncFrequency({
                        syncId: syncConfig.id,
                        interval,
                        syncName: sync_name,
                        environmentId: environment.id,
                        logCtx
                    });
                    if (res.isErr()) {
                        const error = new NangoError('error_updating_sync_schedule_frequency', {
                            syncId: syncConfig.id,
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
        let file_location = '';
        if (is_public) {
            file_location = (await remoteFileService.copy(
                `${config.public_route}/dist`,
                `${sync_name}-${config.provider}.js`,
                `${env}/account/${account.id}/environment/${environment.id}/config/${nango_config_id}/${sync_name}-v${version}.js`,
                environment.id,
                `${sync_name}-${provider_config_key}.js`
            )) as string;
        } else {
            file_location = (await remoteFileService.upload(
                jsFile as string,
                `${env}/account/${account.id}/environment/${environment.id}/config/${nango_config_id}/${sync_name}-v${version}.js`,
                environment.id
            )) as string;
        }

        if (!file_location) {
            await logCtx.error('There was an error uploading the template', { isPublic: is_public, syncName: sync_name, version });
            await logCtx.failed();

            throw new NangoError('file_upload_error');
        }

        if (is_public) {
            await remoteFileService.copy(
                config.public_route as string,
                `${type}s/${sync_name}.ts`,
                `${env}/account/${account.id}/environment/${environment.id}/config/${nango_config_id}/${sync_name}.ts`,
                environment.id,
                `${sync_name}.ts`
            );
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
            idsToMarkAsInvactive.push(...ids);
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
            models,
            active: true,
            runs,
            input: input && typeof input !== 'string' ? String(input.name) : input,
            model_schema: JSON.stringify(model_schema) as unknown as SyncModelSchema[],
            environment_id: environment.id,
            deleted: false,
            track_deletes: false,
            type,
            auto_start: auto_start === false ? false : true,
            attributes,
            metadata,
            pre_built: true,
            is_public,
            enabled: true,
            webhook_subscriptions: null
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
        const syncIds = await db.knex.from<SyncConfig>(TABLE).insert(insertData).returning('id');

        flowReturnData.forEach((flow, index) => {
            const row = syncIds[index];
            if (row) {
                flow.id = row.id;
            }
        });

        const endpoints: SyncEndpoint[] = [];
        syncIds.forEach((row, index) => {
            const sync = configs[index] as IncomingPreBuiltFlowConfig;
            if (sync.endpoints && row.id) {
                sync.endpoints.forEach((endpoint, endpointIndex) => {
                    const method = Object.keys(endpoint)[0] as HTTP_VERB;
                    const path = endpoint[method] as string;
                    const res: SyncEndpoint = {
                        sync_config_id: row.id as number,
                        method,
                        path
                    };
                    const model = sync.models[endpointIndex] as string;
                    if (model) {
                        res.model = model;
                    }
                    endpoints.push(res);
                });
            }
        });

        if (endpoints.length > 0) {
            await db.knex.from<SyncEndpoint>(ENDPOINT_TABLE).insert(endpoints);
        }

        if (idsToMarkAsInvactive.length > 0) {
            await db.knex.from<SyncConfig>(TABLE).update({ active: false }).whereIn('id', idsToMarkAsInvactive);
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
    } catch (e) {
        const content = `Failed to deploy the ${nameOfType}${configs.length === 1 ? '' : 's'} (${configs.map((config) => config.name).join(', ')}).`;

        await logCtx.error('Failed to deploy', { nameOfType, configs: configs.map((config) => config.name), error: e });
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
    env,
    environment_id,
    account,
    debug,
    logCtx,
    orchestrator
}: {
    flow: FlowParsed;
    env: string;
    environment_id: number;
    account: Account;
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
            const syncsConfig = await getSyncsByProviderConfigAndSyncName(environment_id, providerConfigKey, syncName);

            for (const syncConfig of syncsConfig) {
                const interval = syncConfig.frequency || runs;
                const res = await orchestrator.updateSyncFrequency({
                    syncId: syncConfig.id,
                    interval,
                    syncName,
                    environmentId: environment_id,
                    logCtx
                });
                if (res.isErr()) {
                    const error = new NangoError('error_updating_sync_schedule_frequency', {
                        syncId: syncConfig.id,
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
                input: flow.input || undefined,
                sync_type: flow.sync_type as SyncType,
                webhook_subscriptions: flow.webhookSubscriptions || [],
                enabled: lastSyncWasEnabled && !shouldCap
            }
        }
    };
}
