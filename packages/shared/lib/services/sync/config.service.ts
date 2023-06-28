import { schema, dbNamespace } from '../../db/database.js';
import configService from '../config.service.js';
import fileService from '../file.service.js';
import { updateSyncScheduleFrequency } from './schedule.service.js';
import {
    createActivityLog,
    updateSuccess as updateSuccessActivityLog,
    createActivityLogMessageAndEnd,
    createActivityLogDatabaseErrorMessageAndEnd
} from '../activity.service.js';
import type { LogLevel, LogAction } from '../../models/Activity.js';
import type { IncomingSyncConfig, SyncConfig } from '../../models/Sync.js';
import type { NangoConnection } from '../../models/Connection.js';
import type { Config as ProviderConfig } from '../../models/Provider.js';
import type { NangoConfig } from '../../integrations/index.js';
import { NangoError } from '../../utils/error.js';
import { getEnv } from '../../utils/utils.js';

const TABLE = dbNamespace + 'sync_configs';

export async function createSyncConfig(account_id: number, syncs: IncomingSyncConfig[]) {
    const insertData = [];

    const log = {
        level: 'info' as LogLevel,
        success: null,
        action: 'sync' as LogAction,
        start: Date.now(),
        end: Date.now(),
        timestamp: Date.now(),
        connection_id: null,
        provider: null,
        provider_config_key: `${syncs.length} providers`,
        account_id: account_id,
        operation_name: 'sync.deploy'
    };

    let syncsWithVersions: Omit<IncomingSyncConfig, 'fileBody'>[] = syncs.map((sync) => {
        const { fileBody: _fileBody, model_schema, ...rest } = sync;
        const modelSchema = JSON.parse(model_schema as unknown as string);
        return { ...rest, model_schema: modelSchema };
    });

    const activityLogId = await createActivityLog(log);

    for (const sync of syncs) {
        const { syncName, providerConfigKey, fileBody, models, runs, version: optionalVersion, model_schema } = sync;
        if (!syncName || !providerConfigKey || !fileBody || !models || !runs) {
            throw new NangoError('missing_required_fields_on_deploy');
        }

        const config = await configService.getProviderConfig(providerConfigKey, account_id);

        if (!config) {
            throw new NangoError('unknown_provider_config', { providerConfigKey });
        }

        const previousSyncConfig = await getSyncConfigByParams(account_id, syncName, providerConfigKey);
        let bumpedVersion = '';

        if (previousSyncConfig) {
            bumpedVersion = increment(previousSyncConfig.version as string | number).toString();

            // if the schedule changed then update the sync schedule and the client so that it reflects
            // the new schedule
            const { sync_id } = previousSyncConfig;
            if (sync_id) {
                await updateSyncScheduleFrequency(sync_id, runs);
            }
        }

        const version = optionalVersion || bumpedVersion || '1';

        const env = getEnv();
        const file_location = await fileService.upload(fileBody, `${env}/account/${account_id}/config/${config.id}/${syncName}-v${version}.js`);

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

            throw new NangoError('file_upload_error');
        }

        await schema()
            .from<SyncConfig>(TABLE)
            .where({ account_id, nango_config_id: config.id as number, sync_name: syncName })
            .update({ active: false });

        insertData.push({
            account_id,
            nango_config_id: config?.id as number,
            sync_name: syncName,
            models,
            version,
            file_location,
            runs,
            active: true,
            model_schema
        });
    }

    if (insertData.length === 0) {
        throw new NangoError('empty_insert_data_on_deploy');
    }

    try {
        const result = await schema().from<SyncConfig>(TABLE).insert(insertData).returning(['id', 'version']);

        await updateSuccessActivityLog(activityLogId as number, true);

        await createActivityLogMessageAndEnd({
            level: 'info',
            activity_log_id: activityLogId as number,
            timestamp: Date.now(),
            content: `Successfully deployed the syncs (${JSON.stringify(syncsWithVersions, null, 2)}).`
        });

        return result;
    } catch (e) {
        await updateSuccessActivityLog(activityLogId as number, false);

        await createActivityLogDatabaseErrorMessageAndEnd(
            `Failed to deploy the syncs (${JSON.stringify(syncsWithVersions, null, 2)}).`,
            e,
            activityLogId as number
        );
        throw new NangoError('error_creating_sync_config');
    }
}

export async function getSyncConfig(nangoConnection: NangoConnection, syncName?: string, syncId?: string): Promise<NangoConfig | null> {
    let syncConfigs;

    if (!syncName) {
        syncConfigs = await getSyncConfigsByParams(nangoConnection.account_id, nangoConnection.provider_config_key);

        if (!syncConfigs || syncConfigs.length === 0) {
            return null;
        }
    } else {
        syncConfigs = await getSyncConfigByParams(nangoConnection.account_id as number, syncName, nangoConnection.provider_config_key as string);
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

    // we have a sync name which means we have a single sync config
    // let's update that to have the sync id so we can link everything together
    if (syncName && syncId && syncConfigs.length === 1) {
        const [config] = syncConfigs;
        if (config) {
            await updateSyncConfigWithSyncId(config?.id as number, syncId);
        }
    }

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

export async function getSyncConfigsByParams(account_id: number, providerConfigKey: string): Promise<SyncConfig[] | null> {
    const config = await configService.getProviderConfig(providerConfigKey, account_id);

    if (!config) {
        throw new Error('Provider config not found');
    }

    const result = await schema()
        .from<SyncConfig>(TABLE)
        .where({ account_id, nango_config_id: config.id as number, active: true });

    if (result) {
        return result;
    }

    return null;
}

export async function getSyncConfigByParams(account_id: number, sync_name: string, providerConfigKey: string): Promise<SyncConfig | null> {
    const config = await configService.getProviderConfig(providerConfigKey, account_id);

    if (!config) {
        throw new Error('Provider config not found');
    }

    const result = await schema()
        .from<SyncConfig>(TABLE)
        .where({ account_id, sync_name, nango_config_id: config.id as number, active: true })
        .orderBy('created_at', 'desc')
        .first();

    if (result) {
        return result;
    }

    return null;
}

export async function updateSyncConfigWithSyncId(sync_config_id: number, sync_id: string): Promise<void> {
    await schema().from<SyncConfig>(TABLE).where({ id: sync_config_id }).update({ sync_id });
}

export async function deleteSyncConfig(id: number): Promise<void> {
    await schema().from<SyncConfig>(TABLE).where({ id }).delete();
}

export async function deleteSyncFilesForConfig(id: number): Promise<void> {
    const files = await schema().from<SyncConfig>(TABLE).where({ nango_config_id: id }).select('file_location').pluck('file_location');

    await fileService.deleteFiles(files);
}

export async function getSyncConfigsByAccountId(account_id: number): Promise<(SyncConfig & ProviderConfig)[]> {
    const result = await schema().select('*').from<SyncConfig>(TABLE).join('_nango_configs', `${TABLE}.nango_config_id`, '_nango_configs.id').where({
        '_nango_configs.account_id': account_id,
        active: true
    });

    return result;
}

export async function getSyncConfigsByProviderConfigKey(account_id: number, providerConfigKey: string): Promise<{ name: string }[]> {
    const result = await schema()
        .select(`${TABLE}.sync_name as name`)
        .from<SyncConfig>(TABLE)
        .join('_nango_configs', `${TABLE}.nango_config_id`, '_nango_configs.id')
        .where({
            '_nango_configs.account_id': account_id,
            '_nango_configs.unique_key': providerConfigKey,
            active: true
        });

    return result;
}

function increment(input: number | string): number | string {
    if (typeof input === 'string' && input.includes('.')) {
        const parts = input.split('.');
        for (let i = parts.length - 1; i >= 0; i--) {
            const part = parts[i] as string;
            const num = parseInt(part);
            if (isNaN(num)) {
                throw new Error(`Invalid version string segment: ${parts[i]}`);
            }
            if (num < 9) {
                parts[i] = (num + 1).toString();
                break;
            } else {
                parts[i] = '0';
            }
        }
        return parts.join('.');
    } else if (typeof input === 'string') {
        const num = parseInt(input);
        if (isNaN(num)) {
            throw new Error(`Invalid version string segment: ${input}`);
        }
        return num + 1;
    } else if (typeof input === 'number') {
        return input + 1;
    } else {
        throw new Error(`Invalid version input: ${input}`);
    }
}
