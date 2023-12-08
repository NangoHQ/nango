import { schema, dbNamespace } from '../../../db/database.js';
import configService from '../../config.service.js';
import remoteFileService from '../../file/remote.service.js';
import environmentService from '../../environment.service.js';
import { updateSyncScheduleFrequency } from '../schedule.service.js';
import {
    createActivityLog,
    createActivityLogMessage,
    updateSuccess as updateSuccessActivityLog,
    updateProviderConfigKey,
    createActivityLogMessageAndEnd,
    createActivityLogDatabaseErrorMessageAndEnd
} from '../../activity/activity.service.js';
import { getSyncsByProviderConfigAndSyncName } from '../sync.service.js';
import { LogActionEnum, LogLevel } from '../../../models/Activity.js';
import type { HTTP_VERB, ServiceResponse } from '../../../models/Generic.js';
import {
    SyncModelSchema,
    IncomingFlowConfig,
    SyncConfig,
    SyncDeploymentResult,
    SyncConfigResult,
    SyncConfigType,
    IncomingPreBuiltFlowConfig,
    SyncEndpoint
} from '../../../models/Sync.js';
import { NangoError } from '../../../utils/error.js';
import metricsManager, { MetricTypes } from '../../../utils/metrics.manager.js';
import { getEnv } from '../../../utils/utils.js';
import { nangoConfigFile } from '../../nango-config.service.js';
import { getSyncAndActionConfigByParams, increment, getSyncAndActionConfigsBySyncNameAndConfigId } from './config.service.js';

const TABLE = dbNamespace + 'sync_configs';
const ENDPOINT_TABLE = dbNamespace + 'sync_endpoints';

const nameOfType = 'sync/action';

type FlowWithVersion = Omit<IncomingFlowConfig, 'fileBody'>;

export async function deploy(
    environment_id: number,
    flows: IncomingFlowConfig[],
    nangoYamlBody: string,
    debug = false
): Promise<ServiceResponse<SyncConfigResult | null>> {
    const insertData: SyncConfig[] = [];

    const providers = flows.map((flow) => flow.providerConfigKey);
    const providerConfigKeys = [...new Set(providers)];

    const idsToMarkAsInvactive: number[] = [];
    const accountId = (await environmentService.getAccountIdFromEnvironment(environment_id)) as number;

    const log = {
        level: 'info' as LogLevel,
        success: null,
        action: LogActionEnum.SYNC_DEPLOY,
        start: Date.now(),
        end: Date.now(),
        timestamp: Date.now(),
        connection_id: null,
        provider: null,
        provider_config_key: `${flows.length} sync${flows.length === 1 ? '' : 's'} from ${providerConfigKeys.length} integration${
            providerConfigKeys.length === 1 ? '' : 's'
        }`,
        environment_id: environment_id,
        operation_name: LogActionEnum.SYNC_DEPLOY
    };

    let flowsWithVersions: FlowWithVersion[] = flows.map((flow) => {
        const { fileBody: _fileBody, model_schema, ...rest } = flow;
        const modelSchema = JSON.parse(model_schema);
        return { ...rest, model_schema: modelSchema };
    });

    const activityLogId = await createActivityLog(log);
    const env = getEnv();

    if (nangoYamlBody) {
        await remoteFileService.upload(nangoYamlBody, `${env}/account/${accountId}/environment/${environment_id}/${nangoConfigFile}`, environment_id);
    }

    const flowReturnData: SyncDeploymentResult[] = [];

    for (const flow of flows) {
        const { success, error, response } = await compileDeployInfo(
            flow,
            flowsWithVersions,
            idsToMarkAsInvactive,
            insertData,
            flowReturnData,
            env,
            environment_id,
            accountId,
            activityLogId as number,
            debug
        );

        if (!success || !response) {
            return { success, error, response: null };
        }

        flowsWithVersions = response as FlowWithVersion[];
    }

    if (insertData.length === 0) {
        if (debug) {
            await createActivityLogMessage({
                environment_id,
                level: 'debug',
                activity_log_id: activityLogId as number,
                timestamp: Date.now(),
                content: `All syncs were deleted.`
            });
        }
        await updateSuccessActivityLog(activityLogId as number, true);

        return { success: true, error: null, response: { result: [], activityLogId } };
    }

    try {
        const flowIds = await schema().from<SyncConfig>(TABLE).insert(insertData).returning('id');

        const endpoints: Array<SyncEndpoint> = [];
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
            await schema().from<SyncEndpoint>(ENDPOINT_TABLE).insert(endpoints);
        }

        if (idsToMarkAsInvactive.length > 0) {
            await schema().from<SyncConfig>(TABLE).update({ active: false }).whereIn('id', idsToMarkAsInvactive);
        }

        await updateSuccessActivityLog(activityLogId as number, true);

        await createActivityLogMessageAndEnd({
            level: 'info',
            environment_id,
            activity_log_id: activityLogId as number,
            timestamp: Date.now(),
            content: `Successfully deployed the ${nameOfType}${flowsWithVersions.length > 1 ? 's' : ''} ${JSON.stringify(flowsWithVersions, null, 2)}`
        });

        const shortContent = `Successfully deployed the ${nameOfType}${flowsWithVersions.length > 1 ? 's' : ''} (${flowsWithVersions
            .map((flow) => flow['syncName'])
            .join(', ')}).`;

        await metricsManager.capture(
            MetricTypes.SYNC_DEPLOY_SUCCESS,
            shortContent,
            LogActionEnum.SYNC_DEPLOY,
            {
                environmentId: String(environment_id),
                syncName: flowsWithVersions.map((flow) => flow['syncName']).join(', '),
                accountId: String(accountId),
                providers: providers.join(', ')
            },
            'deploy_type:custom'
        );

        return { success: true, error: null, response: { result: flowReturnData, activityLogId } };
    } catch (e) {
        await updateSuccessActivityLog(activityLogId as number, false);

        await createActivityLogDatabaseErrorMessageAndEnd(
            `Failed to deploy the syncs (${JSON.stringify(flowsWithVersions, null, 2)}).`,
            e,
            activityLogId as number,
            environment_id
        );

        const shortContent = `Failure to deploy the syncs (${flowsWithVersions.map((flow) => flow.syncName).join(', ')}).`;

        await metricsManager.capture(
            MetricTypes.SYNC_DEPLOY_FAILURE,
            shortContent,
            LogActionEnum.SYNC_DEPLOY,
            {
                environmentId: String(environment_id),
                syncName: flowsWithVersions.map((flow) => flow.syncName).join(', '),
                accountId: String(accountId),
                providers: providers.join(', ')
            },
            'deploy_type:custom'
        );

        throw new NangoError('error_creating_sync_config');
    }
}

export async function deployPreBuilt(
    environment_id: number,
    configs: IncomingPreBuiltFlowConfig[],
    nangoYamlBody: string
): Promise<ServiceResponse<SyncConfigResult | null>> {
    const [firstConfig] = configs;

    const log = {
        level: 'info' as LogLevel,
        success: null,
        action: LogActionEnum.SYNC_DEPLOY,
        start: Date.now(),
        end: Date.now(),
        timestamp: Date.now(),
        connection_id: null,
        provider: configs.length === 1 && firstConfig?.provider ? firstConfig?.provider : null,
        provider_config_key: '',
        environment_id: environment_id,
        operation_name: LogActionEnum.SYNC_DEPLOY
    };

    const accountId = (await environmentService.getAccountIdFromEnvironment(environment_id)) as number;
    const providerConfigKeys = [];

    const activityLogId = await createActivityLog(log);

    const idsToMarkAsInvactive = [];
    const insertData: SyncConfig[] = [];
    let nango_config_id: number;
    let provider_config_key: string;

    const env = getEnv();

    if (nangoYamlBody) {
        await remoteFileService.upload(nangoYamlBody, `${env}/account/${accountId}/environment/${environment_id}/${nangoConfigFile}`, environment_id);
    } else {
        // this is a public template so copy it from the public location
        await remoteFileService.copy(
            firstConfig?.public_route as string,
            nangoConfigFile,
            `${env}/account/${accountId}/environment/${environment_id}/${nangoConfigFile}`,
            environment_id
        );
    }

    const flowReturnData: SyncDeploymentResult[] = [];

    for (const config of configs) {
        if (!config.providerConfigKey) {
            const providerLookup = await configService.getConfigIdByProvider(config?.provider, environment_id);
            if (!providerLookup) {
                const error = new NangoError('provider_not_on_account');

                return { success: false, error, response: null };
            }
            ({ id: nango_config_id, unique_key: provider_config_key } = providerLookup);
        } else {
            const providerConfig = await configService.getProviderConfig(config.providerConfigKey, environment_id);

            if (!providerConfig) {
                const error = new NangoError('unknown_provider_config', { providerConfigKey: config.providerConfigKey });

                return { success: false, error, response: null };
            }
            provider_config_key = config.providerConfigKey;
            nango_config_id = providerConfig.id as number;
        }

        providerConfigKeys.push(provider_config_key);

        const { type, models, auto_start, runs, model_schema, is_public, attributes = {}, metadata = {} } = config;
        const sync_name = config.name || config.syncName;

        if (type === SyncConfigType.SYNC && !runs) {
            const error = new NangoError('missing_required_fields_on_deploy');

            return { success: false, error, response: null };
        }

        if (!sync_name || !nango_config_id) {
            const error = new NangoError('missing_required_fields_on_deploy');

            return { success: false, error, response: null };
        }

        const previousSyncAndActionConfig = await getSyncAndActionConfigByParams(environment_id, sync_name, provider_config_key);
        let bumpedVersion = '';

        if (previousSyncAndActionConfig) {
            bumpedVersion = increment(previousSyncAndActionConfig.version as string | number).toString();

            const syncs = await getSyncsByProviderConfigAndSyncName(environment_id, provider_config_key, sync_name);
            for (const sync of syncs) {
                if (!runs) {
                    continue;
                }
                const { success, error } = await updateSyncScheduleFrequency(sync.id as string, runs, sync_name, activityLogId as number, environment_id);

                if (!success) {
                    return { success, error, response: null };
                }
            }
        }

        const version = bumpedVersion || '0.0.1';

        const jsFile = typeof config.fileBody === 'string' ? config.fileBody : config.fileBody?.js;
        let file_location = '';
        if (is_public) {
            file_location = (await remoteFileService.copy(
                `${config?.public_route}/dist`,
                `${sync_name}.js`,
                `${env}/account/${accountId}/environment/${environment_id}/config/${nango_config_id}/${sync_name}-v${version}.js`,
                environment_id
            )) as string;
        } else {
            file_location = (await remoteFileService.upload(
                jsFile as string,
                `${env}/account/${accountId}/environment/${environment_id}/config/${nango_config_id}/${sync_name}-v${version}.js`,
                environment_id
            )) as string;
        }

        if (!file_location) {
            await createActivityLogMessageAndEnd({
                level: 'error',
                environment_id,
                activity_log_id: activityLogId as number,
                timestamp: Date.now(),
                content: `There was an error uploading the ${is_public ? 'public template' : ''} file ${sync_name}-v${version}.js`
            });

            throw new NangoError('file_upload_error');
        }

        if (is_public) {
            await remoteFileService.copy(
                config?.public_route as string,
                `${sync_name}.ts`,
                `${env}/account/${accountId}/environment/${environment_id}/config/${nango_config_id}/${sync_name}.ts`,
                environment_id
            );
        } else {
            if (typeof config.fileBody === 'object' && config.fileBody?.ts) {
                await remoteFileService.upload(
                    config.fileBody.ts,
                    `${env}/account/${accountId}/environment/${environment_id}/config/${nango_config_id}/${sync_name}.ts`,
                    environment_id
                );
            }
        }

        const oldConfigs = await getSyncAndActionConfigsBySyncNameAndConfigId(environment_id, nango_config_id as number, sync_name);

        if (oldConfigs.length > 0) {
            const ids = oldConfigs.map((oldConfig: SyncConfig) => oldConfig.id as number);
            idsToMarkAsInvactive.push(...ids);
        }

        insertData.push({
            sync_name,
            nango_config_id,
            file_location,
            version,
            models,
            active: true,
            runs,
            model_schema: model_schema as unknown as SyncModelSchema[],
            environment_id,
            deleted: false,
            track_deletes: false,
            type,
            auto_start: auto_start === false ? false : true,
            attributes,
            metadata,
            pre_built: true,
            is_public
        });

        flowReturnData.push({
            ...config,
            providerConfigKey: provider_config_key,
            version
        });
    }

    const uniqueProviderConfigKeys = [...new Set(providerConfigKeys)];

    let providerConfigKeyLog = '';
    if (configs.length === 1) {
        providerConfigKeyLog = uniqueProviderConfigKeys[0] as string;
    } else {
        providerConfigKeyLog = `${configs.length} ${nameOfType}${configs.length === 1 ? '' : 's'} from ${uniqueProviderConfigKeys.length} integration${
            providerConfigKeys.length === 1 ? '' : 's'
        }`;
    }
    await updateProviderConfigKey(activityLogId as number, providerConfigKeyLog);
    const isPublic = configs.every((config) => config.is_public);

    try {
        const syncIds = await schema().from<SyncConfig>(TABLE).insert(insertData).returning('id');

        const endpoints: Array<SyncEndpoint> = [];
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
            await schema().from<SyncEndpoint>(ENDPOINT_TABLE).insert(endpoints);
        }

        if (idsToMarkAsInvactive.length > 0) {
            await schema().from<SyncConfig>(TABLE).update({ active: false }).whereIn('id', idsToMarkAsInvactive);
        }

        await updateSuccessActivityLog(activityLogId as number, true);

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

        await createActivityLogMessageAndEnd({
            level: 'info',
            environment_id,
            activity_log_id: activityLogId as number,
            timestamp: Date.now(),
            content
        });

        await metricsManager.capture(
            MetricTypes.SYNC_DEPLOY_SUCCESS,
            content,
            LogActionEnum.SYNC_DEPLOY,
            {
                environmentId: String(environment_id),
                syncName: configs.map((config) => config.name).join(', '),
                accountId: String(accountId),
                integrations: configs.map((config) => config.provider).join(', '),
                preBuilt: 'true',
                is_public: isPublic ? 'true' : 'false'
            },
            `deploy_type:${isPublic ? 'public.' : 'private.'}template`
        );

        return { success: true, error: null, response: { result: flowReturnData, activityLogId } };
    } catch (e) {
        await updateSuccessActivityLog(activityLogId as number, false);

        const content = `Failed to deploy the ${nameOfType}${configs.length === 1 ? '' : 's'} (${configs.map((config) => config.name).join(', ')}).`;
        await createActivityLogDatabaseErrorMessageAndEnd(content, e, activityLogId as number, environment_id);

        await metricsManager.capture(
            MetricTypes.SYNC_DEPLOY_FAILURE,
            content,
            LogActionEnum.SYNC_DEPLOY,
            {
                environmentId: String(environment_id),
                syncName: configs.map((config) => config.name).join(', '),
                accountId: String(accountId),
                integration: configs.map((config) => config.provider).join(', '),
                preBuilt: 'true',
                is_public: isPublic ? 'true' : 'false'
            },
            `deploy_type:${isPublic ? 'public.' : 'private.'}template`
        );

        throw new NangoError('error_creating_sync_config');
    }
}

async function compileDeployInfo(
    flow: IncomingFlowConfig,
    flowsWithVersions: FlowWithVersion[],
    idsToMarkAsInvactive: number[],
    insertData: SyncConfig[],
    flowReturnData: SyncConfigResult['result'],
    env: string,
    environment_id: number,
    accountId: number,
    activityLogId: number,
    debug: boolean
): Promise<ServiceResponse<FlowWithVersion[]>> {
    const {
        syncName,
        providerConfigKey,
        fileBody,
        models,
        runs,
        version: optionalVersion,
        model_schema,
        type = SyncConfigType.SYNC,
        track_deletes,
        auto_start,
        attributes = {},
        metadata = {}
    } = flow;
    if (type === SyncConfigType.SYNC && !runs) {
        const error = new NangoError('missing_required_fields_on_deploy');

        return { success: false, error, response: null };
    }

    if (!syncName || !providerConfigKey || !fileBody) {
        const error = new NangoError('missing_required_fields_on_deploy');

        return { success: false, error, response: null };
    }

    const config = await configService.getProviderConfig(providerConfigKey, environment_id);

    if (!config) {
        const error = new NangoError('unknown_provider_config', { providerConfigKey });

        return { success: false, error, response: null };
    }

    const previousSyncAndActionConfig = await getSyncAndActionConfigByParams(environment_id, syncName, providerConfigKey);
    let bumpedVersion = '';

    if (previousSyncAndActionConfig) {
        bumpedVersion = increment(previousSyncAndActionConfig.version as string | number).toString();

        if (debug) {
            await createActivityLogMessage({
                level: 'debug',
                environment_id,
                activity_log_id: activityLogId as number,
                timestamp: Date.now(),
                content: `A previous sync config was found for ${syncName} with version ${previousSyncAndActionConfig.version}`
            });
        }

        const syncs = await getSyncsByProviderConfigAndSyncName(environment_id, providerConfigKey, syncName);
        for (const sync of syncs) {
            if (!runs) {
                continue;
            }
            const { success, error } = await updateSyncScheduleFrequency(sync.id as string, runs, syncName, activityLogId as number, environment_id);

            if (!success) {
                return { success, error, response: null };
            }
        }
    }

    const version = optionalVersion || bumpedVersion || '1';

    const jsFile = typeof fileBody === 'string' ? fileBody : fileBody?.js;
    const file_location = (await remoteFileService.upload(
        jsFile as string,
        `${env}/account/${accountId}/environment/${environment_id}/config/${config.id}/${syncName}-v${version}.js`,
        environment_id
    )) as string;

    if (typeof fileBody === 'object' && fileBody?.ts) {
        await remoteFileService.upload(
            fileBody.ts,
            `${env}/account/${accountId}/environment/${environment_id}/config/${config.id}/${syncName}.ts`,
            environment_id
        );
    }

    flowsWithVersions = flowsWithVersions.map((flowWithVersions) => {
        if (flowWithVersions['syncName'] === syncName) {
            return {
                ...flowWithVersions,
                version
            } as unknown as FlowWithVersion;
        }
        return flowWithVersions;
    });

    if (!file_location) {
        await updateSuccessActivityLog(activityLogId as number, false);

        await createActivityLogMessageAndEnd({
            level: 'error',
            environment_id,
            activity_log_id: activityLogId as number,
            timestamp: Date.now(),
            content: `There was an error uploading the sync file ${syncName}-v${version}.js`
        });

        // this is a platform error so throw this
        throw new NangoError('file_upload_error');
    }

    const oldConfigs = await getSyncAndActionConfigsBySyncNameAndConfigId(environment_id, config.id as number, syncName);

    if (oldConfigs.length > 0) {
        const ids = oldConfigs.map((oldConfig: SyncConfig) => oldConfig.id as number);
        idsToMarkAsInvactive.push(...ids);

        if (debug) {
            await createActivityLogMessage({
                level: 'debug',
                environment_id,
                activity_log_id: activityLogId as number,
                timestamp: Date.now(),
                content: `Marking ${ids.length} old sync configs as inactive for ${syncName} with version ${version} as the active sync config`
            });
        }
    }

    insertData.push({
        environment_id,
        nango_config_id: config?.id as number,
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
        input: flow.input || '',
        sync_type: flow.sync_type,
        webhook_subscriptions: flow.webhookSubscriptions || []
    });

    flowReturnData.push({
        ...flow,
        name: syncName,
        version
    });

    return { success: true, error: null, response: flowsWithVersions };
}
