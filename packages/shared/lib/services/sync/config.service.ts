import { schema, dbNamespace } from '../../db/database.js';
import configService from '../config.service.js';
import fileService from '../file.service.js';
import type { IncomingSyncConfig, SyncConfig } from '../../models/Sync.js';
import type { NangoConnection } from '../../models/Connection.js';
import type { NangoConfig } from '../../integrations/index.js';
import { getEnv } from '../../utils/utils.js';

const TABLE = dbNamespace + 'sync_configs';

export async function createSyncConfig(account_id: number, syncs: IncomingSyncConfig[]) {
    const insertData = [];

    for (const sync of syncs) {
        const { syncName, providerConfigKey, fileBody, models, runs, version: optionalVersion, model_schema } = sync;
        if (!syncName || !providerConfigKey || !fileBody || !models || !runs) {
            continue;
        }
        const config = await configService.getProviderConfig(providerConfigKey, account_id);

        if (!config) {
            continue;
        }

        const previousSyncConfig = await getSyncConfigByParams(account_id, syncName, providerConfigKey);
        let bumpedVersion = '';

        if (previousSyncConfig) {
            bumpedVersion = increment(previousSyncConfig.version as string | number).toString();
        }

        const version = optionalVersion || bumpedVersion || '1';

        await schema().from(TABLE).where({ account_id, nango_config_id: config.id, sync_name: syncName }).update({ active: false });

        const env = getEnv();
        const file_location = await fileService.upload(fileBody, `${env}/account/${account_id}/config/${config.id}/${syncName}-v${version}.js`);

        if (!file_location) {
            continue;
        }

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

    try {
        const result = await schema().from<SyncConfig>(TABLE).insert(insertData).returning(['id', 'version']);

        return result;
    } catch (e) {
        console.log(e);
        return null;
    }
}

export async function getSyncConfig(nangoConnection: NangoConnection, syncName?: string): Promise<NangoConfig | null> {
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
