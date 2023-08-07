import semver from 'semver';
import db, { schema, dbNamespace } from '../../db/database.js';
import configService from '../config.service.js';
import fileService from '../file.service.js';
import environmentService from '../environment.service.js';
import { updateSyncScheduleFrequency } from './schedule.service.js';
import {
    createActivityLog,
    createActivityLogMessage,
    updateSuccess as updateSuccessActivityLog,
    createActivityLogMessageAndEnd,
    createActivityLogDatabaseErrorMessageAndEnd
} from '../activity/activity.service.js';
import { getSyncsByProviderConfigAndSyncName } from './sync.service.js';
import { LogActionEnum, LogLevel } from '../../models/Activity.js';
import type { ServiceResponse } from '../../models/Generic.js';
import type { SyncModelSchema, SyncConfigWithProvider, IncomingSyncConfig, SyncConfig, SlimSync, SyncConfigResult } from '../../models/Sync.js';
import type { NangoConnection } from '../../models/Connection.js';
import type { Config as ProviderConfig } from '../../models/Provider.js';
import type { NangoConfig } from '../../integrations/index.js';
import { NangoError } from '../../utils/error.js';
import errorManager, { ErrorSourceEnum } from '../../utils/error.manager.js';
import { getEnv } from '../../utils/utils.js';

const TABLE = dbNamespace + 'sync_configs';

export async function createSyncConfig(environment_id: number, syncs: IncomingSyncConfig[], debug = false): Promise<ServiceResponse<SyncConfigResult | null>> {
    const insertData = [];

    const providers = syncs.map((sync) => sync.providerConfigKey);
    const providerConfigKeys = [...new Set(providers)];

    const idsToMarkAsInvactive = [];
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
        provider_config_key: `${syncs.length} sync${syncs.length === 1 ? '' : 's'} from ${providerConfigKeys.length} integration${
            providerConfigKeys.length === 1 ? '' : 's'
        }`,
        environment_id: environment_id,
        operation_name: LogActionEnum.SYNC_DEPLOY
    };

    let syncsWithVersions: Omit<IncomingSyncConfig, 'fileBody'>[] = syncs.map((sync) => {
        const { fileBody: _fileBody, model_schema, ...rest } = sync;
        const modelSchema = JSON.parse(model_schema);
        return { ...rest, model_schema: modelSchema };
    });

    const activityLogId = await createActivityLog(log);

    for (const sync of syncs) {
        const { syncName, providerConfigKey, fileBody, models, runs, version: optionalVersion, model_schema } = sync;
        if (!syncName || !providerConfigKey || !fileBody || !models || !runs) {
            const error = new NangoError('missing_required_fields_on_deploy');

            return { success: false, error, response: null };
        }

        const config = await configService.getProviderConfig(providerConfigKey, environment_id);

        if (!config) {
            const error = new NangoError('unknown_provider_config', { providerConfigKey });

            return { success: false, error, response: null };
        }

        const previousSyncConfig = await getSyncConfigByParams(environment_id, syncName, providerConfigKey);
        let bumpedVersion = '';

        if (previousSyncConfig) {
            bumpedVersion = increment(previousSyncConfig.version as string | number).toString();

            if (debug) {
                await createActivityLogMessage({
                    level: 'debug',
                    activity_log_id: activityLogId as number,
                    timestamp: Date.now(),
                    content: `A previous sync config was found for ${syncName} with version ${previousSyncConfig.version}`
                });
            }

            const syncs = await getSyncsByProviderConfigAndSyncName(environment_id, providerConfigKey, syncName);
            for (const sync of syncs) {
                const { success, error } = await updateSyncScheduleFrequency(sync.id as string, runs, syncName, activityLogId as number, environment_id);

                if (!success) {
                    return { success, error, response: null };
                }
            }
        }

        const version = optionalVersion || bumpedVersion || '1';

        const env = getEnv();
        const file_location = await fileService.upload(
            fileBody,
            `${env}/account/${accountId}/environment/${environment_id}/config/${config.id}/${syncName}-v${version}.js`,
            environment_id
        );

        syncsWithVersions = syncsWithVersions.map((syncWithVersion) => {
            if (syncWithVersion.syncName === syncName) {
                return { ...syncWithVersion, version };
            }
            return syncWithVersion;
        });

        if (!file_location) {
            await updateSuccessActivityLog(activityLogId as number, false);

            await createActivityLogMessageAndEnd({
                level: 'error',
                activity_log_id: activityLogId as number,
                timestamp: Date.now(),
                content: `There was an error uploading the sync file ${syncName}-v${version}.js`
            });

            // this is a platform error so throw this
            throw new NangoError('file_upload_error');
        }

        const oldConfigs = await getSyncConfigsBySyncNameAndConfigId(environment_id, config.id as number, syncName);

        if (oldConfigs.length > 0) {
            const ids = oldConfigs.map((oldConfig: SyncConfig) => oldConfig.id as number);
            idsToMarkAsInvactive.push(...ids);

            if (debug) {
                await createActivityLogMessage({
                    level: 'debug',
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
            models,
            version,
            file_location,
            runs,
            active: true,
            model_schema: model_schema as unknown as SyncModelSchema[]
        });
    }

    if (insertData.length === 0) {
        if (debug) {
            await createActivityLogMessage({
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
        const result = await schema().from<SyncConfig>(TABLE).insert(insertData).returning(['id', 'version', 'sync_name']);

        if (idsToMarkAsInvactive.length > 0) {
            await schema().from<SyncConfig>(TABLE).update({ active: false }).whereIn('id', idsToMarkAsInvactive);
        }

        await updateSuccessActivityLog(activityLogId as number, true);

        await createActivityLogMessageAndEnd({
            level: 'info',
            activity_log_id: activityLogId as number,
            timestamp: Date.now(),
            content: `Successfully deployed the syncs (${JSON.stringify(syncsWithVersions, null, 2)}).`
        });

        const shortContent = `Successfully deployed the syncs (${syncsWithVersions.map((sync) => sync.syncName).join(', ')}).`;

        await errorManager.captureWithJustEnvironment('sync_deploy_success', shortContent, environment_id as number, LogActionEnum.SYNC_DEPLOY, {
            syncName: syncsWithVersions.map((sync) => sync.syncName).join(', '),
            accountId: accountId as number,
            providers
        });

        return { success: true, error: null, response: { result, activityLogId } };
    } catch (e) {
        await updateSuccessActivityLog(activityLogId as number, false);

        await createActivityLogDatabaseErrorMessageAndEnd(
            `Failed to deploy the syncs (${JSON.stringify(syncsWithVersions, null, 2)}).`,
            e,
            activityLogId as number
        );

        const shortContent = `Failure to deploy the syncs (${syncsWithVersions.map((sync) => sync.syncName).join(', ')}).`;

        await errorManager.captureWithJustEnvironment('sync_deploy_failure', shortContent, environment_id as number, LogActionEnum.SYNC_DEPLOY, {
            syncName: syncsWithVersions.map((sync) => sync.syncName).join(', '),
            accountId: accountId as number,
            providers
        });
        throw new NangoError('error_creating_sync_config');
    }
}

export async function getSyncConfig(nangoConnection: NangoConnection, syncName?: string): Promise<NangoConfig | null> {
    let syncConfigs;

    if (!syncName) {
        syncConfigs = await getSyncConfigsByParams(nangoConnection.environment_id, nangoConnection.provider_config_key);

        if (!syncConfigs || syncConfigs.length === 0) {
            return null;
        }
    } else {
        syncConfigs = await getSyncConfigByParams(nangoConnection.environment_id as number, syncName, nangoConnection.provider_config_key as string);
        if (!syncConfigs) {
            return null;
        }

        // this is an array because sometimes we don't know the sync name, but regardless
        // we want to iterate over the sync configs
        syncConfigs = [syncConfigs];
    }

    const nangoConfig: NangoConfig = {
        integrations: {
            [nangoConnection.provider_config_key as string]: {}
        },
        models: {}
    };

    for (const syncConfig of syncConfigs) {
        if (nangoConnection.provider_config_key !== undefined) {
            const key = nangoConnection.provider_config_key;

            const providerConfig = nangoConfig.integrations[key] ?? {};

            providerConfig[syncConfig.sync_name] = {
                sync_config_id: syncConfig.id as number,
                runs: syncConfig.runs,
                returns: syncConfig.models,
                fileLocation: syncConfig.file_location,
                version: syncConfig.version as string
            };

            nangoConfig.integrations[key] = providerConfig;
        }
    }

    return nangoConfig;
}

export async function getSyncConfigsByParams(environment_id: number, providerConfigKey: string): Promise<SyncConfig[] | null> {
    const config = await configService.getProviderConfig(providerConfigKey, environment_id);

    if (!config) {
        throw new Error('Provider config not found');
    }

    const result = await schema()
        .from<SyncConfig>(TABLE)
        .where({ environment_id, nango_config_id: config.id as number, active: true, deleted: false });

    if (result) {
        return result;
    }

    return null;
}

export async function getSyncConfigsBySyncNameAndConfigId(environment_id: number, nango_config_id: number, sync_name: string): Promise<SyncConfig[]> {
    try {
        const result = await schema().from<SyncConfig>(TABLE).where({
            environment_id,
            nango_config_id,
            sync_name,
            active: true,
            deleted: false
        });

        if (result) {
            return result;
        }
    } catch (error) {
        await errorManager.report(error, {
            environmentId: environment_id,
            source: ErrorSourceEnum.PLATFORM,
            operation: LogActionEnum.DATABASE,
            metadata: {
                environment_id,
                nango_config_id,
                sync_name
            }
        });
    }
    return [];
}

export async function getSyncConfigByParams(environment_id: number, sync_name: string, providerConfigKey: string): Promise<SyncConfig | null> {
    const config = await configService.getProviderConfig(providerConfigKey, environment_id);

    if (!config) {
        throw new Error('Provider config not found');
    }

    try {
        const result = await schema()
            .from<SyncConfig>(TABLE)
            .where({ environment_id, sync_name, nango_config_id: config.id as number, active: true, deleted: false })
            .orderBy('created_at', 'desc')
            .first();

        if (result) {
            return result;
        }
    } catch (error) {
        await errorManager.report(error, {
            environmentId: environment_id,
            source: ErrorSourceEnum.PLATFORM,
            operation: LogActionEnum.DATABASE,
            metadata: {
                environment_id,
                sync_name,
                providerConfigKey
            }
        });
        return null;
    }

    return null;
}

export async function deleteSyncConfig(id: number): Promise<void> {
    await schema().from<SyncConfig>(TABLE).where({ id, deleted: false }).update({ active: false, deleted: true, deleted_at: new Date() });
}

export async function deleteByConfigId(nango_config_id: number): Promise<void> {
    await schema().from<SyncConfig>(TABLE).where({ nango_config_id, deleted: false }).update({ deleted: true, deleted_at: new Date() });
}

export async function deleteSyncFilesForConfig(id: number, environmentId: number): Promise<void> {
    try {
        const files = await schema().from<SyncConfig>(TABLE).where({ nango_config_id: id, deleted: false }).select('file_location').pluck('file_location');

        if (files.length > 0) {
            await fileService.deleteFiles(files);
        }
    } catch (error) {
        await errorManager.report(error, {
            environmentId,
            source: ErrorSourceEnum.PLATFORM,
            operation: LogActionEnum.DATABASE,
            metadata: {
                id
            }
        });
    }
}

export async function getActiveSyncConfigsByEnvironmentId(environment_id: number): Promise<SyncConfigWithProvider[]> {
    const result = await schema()
        .select(
            `${TABLE}.id`,
            `${TABLE}.sync_name`,
            `${TABLE}.runs`,
            `${TABLE}.models`,
            `${TABLE}.updated_at`,
            '_nango_configs.provider',
            '_nango_configs.unique_key'
        )
        .from<SyncConfig>(TABLE)
        .join('_nango_configs', `${TABLE}.nango_config_id`, '_nango_configs.id')
        .where({
            active: true,
            '_nango_configs.environment_id': environment_id,
            '_nango_configs.deleted': false,
            [`${TABLE}.deleted`]: false
        });

    return result;
}

export async function getSyncConfigsWithConnectionsByEnvironmentId(environment_id: number): Promise<(SyncConfig & ProviderConfig)[]> {
    const result = await schema()
        .select(
            `${TABLE}.id`,
            `${TABLE}.sync_name`,
            `${TABLE}.runs`,
            `${TABLE}.models`,
            `${TABLE}.version`,
            `${TABLE}.updated_at`,
            '_nango_configs.provider',
            '_nango_configs.unique_key',
            db.knex.raw(
                `(
                    SELECT json_agg(
                        json_build_object(
                            'connection_id', _nango_connections.connection_id,
                            'metadata', _nango_connections.metadata
                        )
                    )
                    FROM nango._nango_connections
                    WHERE _nango_configs.environment_id = _nango_connections.environment_id
                    AND _nango_configs.unique_key = _nango_connections.provider_config_key
                    AND _nango_configs.deleted = false
                    AND _nango_connections.deleted = false
                ) as connections
                `
            )
        )
        .from<SyncConfig>(TABLE)
        .join('_nango_configs', `${TABLE}.nango_config_id`, '_nango_configs.id')
        .where({
            '_nango_configs.environment_id': environment_id,
            active: true,
            '_nango_configs.deleted': false,
            [`${TABLE}.deleted`]: false
        });

    return result;
}

/**
 * Get Sync Configs By Provider Key
 * @desc grab all the sync configs by a provider key
 */
export async function getSyncConfigsByProviderConfigKey(environment_id: number, providerConfigKey: string): Promise<SlimSync[]> {
    const result = await schema()
        .select(`${TABLE}.sync_name as name`, `${TABLE}.id`)
        .from<SyncConfig>(TABLE)
        .join('_nango_configs', `${TABLE}.nango_config_id`, '_nango_configs.id')
        .where({
            '_nango_configs.environment_id': environment_id,
            '_nango_configs.unique_key': providerConfigKey,
            active: true,
            '_nango_configs.deleted': false,
            [`${TABLE}.deleted`]: false
        });

    return result;
}

export async function getSyncConfigByJobId(job_id: number): Promise<SyncConfig | null> {
    const result = await schema()
        .from<SyncConfig>(TABLE)
        .select(`${TABLE}.*`)
        .join('_nango_sync_jobs', `${TABLE}.id`, '_nango_sync_jobs.sync_config_id')
        .where({
            '_nango_sync_jobs.id': job_id,
            '_nango_sync_jobs.deleted': false,
            [`${TABLE}.deleted`]: false
        })
        .first()
        .orderBy('created_at', 'desc');

    if (!result) {
        return null;
    }

    return result;
}

export async function getProviderConfigBySyncAndAccount(sync_name: string, environment_id: number): Promise<string | null> {
    const providerConfigKey = await schema()
        .from<SyncConfig>(TABLE)
        .select('_nango_configs.unique_key')
        .join('_nango_configs', `${TABLE}.nango_config_id`, '_nango_configs.id')
        .where({
            active: true,
            sync_name,
            '_nango_configs.environment_id': environment_id,
            '_nango_configs.deleted': false,
            [`${TABLE}.deleted`]: false
        })
        .first();

    if (providerConfigKey) {
        return providerConfigKey.unique_key;
    }

    return null;
}

export function increment(input: number | string): number | string {
    if (typeof input === 'string') {
        if (input.includes('.')) {
            const valid = semver.valid(input);
            if (!valid) {
                throw new Error(`Invalid version string: ${input}`);
            }
            return semver.inc(input, 'patch') as string;
        } else {
            const num = parseInt(input);
            if (isNaN(num)) {
                throw new Error(`Invalid version string segment: ${input}`);
            }
            return (num + 1).toString();
        }
    } else if (typeof input === 'number') {
        return input + 1;
    } else {
        throw new Error(`Invalid version input: ${input}`);
    }
}
