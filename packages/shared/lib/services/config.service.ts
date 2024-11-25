import type { Config as ProviderConfig } from '../models/Provider.js';
import type { Connection } from '../models/Connection.js';
import db from '@nangohq/database';
import { isCloud, nanoid } from '@nangohq/utils';
import { NangoError } from '../utils/error.js';
import encryptionManager from '../utils/encryption.manager.js';
import syncManager from './sync/manager.service.js';
import { deleteSyncFilesForConfig, deleteByConfigId as deleteSyncConfigByConfigId } from '../services/sync/config/config.service.js';
import environmentService from '../services/environment.service.js';
import type { Orchestrator } from '../clients/orchestrator.js';
import type { AuthModeType } from '@nangohq/types';
import { getProvider } from './providers.js';

interface ValidationRule {
    field: keyof ProviderConfig;
    modes: AuthModeType[];
    isValid(config: ProviderConfig): boolean;
}

class ConfigService {
    async getById(id: number): Promise<ProviderConfig | null> {
        const result = await db.knex.select('*').from<ProviderConfig>(`_nango_configs`).where({ id, deleted: false }).first();

        if (!result) {
            return null;
        }

        return encryptionManager.decryptProviderConfig(result);
    }

    async getProviderName(providerConfigKey: string): Promise<string | null> {
        const result = await db.knex.select('provider').from<ProviderConfig>(`_nango_configs`).where({ unique_key: providerConfigKey, deleted: false });

        if (result == null || result.length == 0 || result[0] == null) {
            return null;
        }

        return result[0].provider;
    }

    async getIdByProviderConfigKey(environment_id: number, providerConfigKey: string): Promise<number | null> {
        const result = await db.knex
            .select('id')
            .from<ProviderConfig>(`_nango_configs`)
            .where({ unique_key: providerConfigKey, environment_id, deleted: false });

        if (result == null || result.length == 0 || result[0] == null) {
            return null;
        }

        return result[0].id;
    }

    async getProviderConfigByUuid(providerConfigKey: string, environment_uuid: string): Promise<ProviderConfig | null> {
        if (!providerConfigKey) {
            throw new NangoError('missing_provider_config');
        }
        if (!environment_uuid) {
            throw new NangoError('missing_environment_uuid');
        }

        const environment_id = await environmentService.getIdByUuid(environment_uuid);

        if (!environment_id) {
            return null;
        }

        return this.getProviderConfig(providerConfigKey, environment_id);
    }

    async getProviderConfig(providerConfigKey: string, environment_id: number): Promise<ProviderConfig | null> {
        const result = await db.knex
            .select('*')
            .from<ProviderConfig>(`_nango_configs`)
            .where({ unique_key: providerConfigKey, environment_id, deleted: false })
            .first();

        if (!result) {
            return null;
        }

        return encryptionManager.decryptProviderConfig(result);
    }

    async listProviderConfigs(environment_id: number): Promise<ProviderConfig[]> {
        return (
            await db.knex
                .select('*')
                .from<ProviderConfig>(`_nango_configs`)
                .where({ environment_id, deleted: false })
                .orderBy('provider', 'asc')
                .orderBy('created_at', 'asc')
        )
            .map((config) => encryptionManager.decryptProviderConfig(config))
            .filter(Boolean) as ProviderConfig[];
    }

    async listIntegrationForApi(environment_id: number): Promise<(ProviderConfig & { connection_count: string })[]> {
        const connectionCountSubquery = db
            .knex('_nango_connections')
            .count('* as connection_count')
            .where({
                '_nango_connections.environment_id': db.knex.ref('_nango_configs.environment_id'),
                '_nango_connections.config_id': db.knex.ref('_nango_configs.id'),
                deleted: false
            })
            .as('connection_count');
        const res = await db.knex
            .select<(ProviderConfig & { connection_count: string })[]>('*', connectionCountSubquery)
            .from<ProviderConfig>(`_nango_configs`)
            .where({ environment_id, deleted: false })
            .orderBy('provider', 'asc')
            .orderBy('created_at', 'asc');

        return res;
    }

    async listProviderConfigsByProvider(environment_id: number, provider: string): Promise<ProviderConfig[]> {
        return (await db.knex.select('*').from<ProviderConfig>(`_nango_configs`).where({ environment_id, provider, deleted: false }))
            .map((config) => encryptionManager.decryptProviderConfig(config))
            .filter((config) => config != null) as ProviderConfig[];
    }

    async createProviderConfig(config: ProviderConfig): Promise<ProviderConfig | null> {
        const provider = getProvider(config.provider);
        if (!provider) {
            throw new NangoError('unknown_provider');
        }

        const configToInsert = config.oauth_client_secret ? encryptionManager.encryptProviderConfig(config) : config;
        configToInsert.missing_fields = this.validateProviderConfig(provider.auth_mode, config);

        const res = await db.knex.from<ProviderConfig>(`_nango_configs`).insert(configToInsert).returning('*');
        return res[0] ?? null;
    }

    async createEmptyProviderConfig(provider: string, environment_id: number): Promise<ProviderConfig> {
        const exists = await db.knex
            .count<{ count: string }>('*')
            .from<ProviderConfig>(`_nango_configs`)
            .where({ provider, environment_id, deleted: false })
            .first();

        const config = await this.createProviderConfig({
            environment_id,
            unique_key: exists?.count === '0' ? provider : `${provider}-${nanoid(4).toLocaleLowerCase()}`,
            provider
        } as ProviderConfig);

        if (!config) {
            throw new NangoError('unknown_provider_config');
        }

        return config;
    }

    async deleteProviderConfig({
        id,
        environmentId,
        providerConfigKey,
        orchestrator
    }: {
        id: number;
        environmentId: number;
        providerConfigKey: string;
        orchestrator: Orchestrator;
    }): Promise<boolean> {
        await syncManager.deleteSyncsByProviderConfig(environmentId, providerConfigKey, orchestrator);

        if (isCloud) {
            await deleteSyncFilesForConfig(id, environmentId);
        }

        await deleteSyncConfigByConfigId(id);

        const updated = await db.knex.from<ProviderConfig>(`_nango_configs`).where({ id, deleted: false }).update({ deleted: true, deleted_at: new Date() });
        if (updated <= 0) {
            return false;
        }

        await db.knex
            .from<Connection>(`_nango_connections`)
            .where({ provider_config_key: providerConfigKey, environment_id: environmentId, deleted: false })
            .update({ deleted: true, deleted_at: new Date() });
        return true;
    }

    async editProviderConfig(config: ProviderConfig) {
        const provider = getProvider(config.provider);
        if (!provider) {
            throw new NangoError('unknown_provider');
        }

        const encrypted = encryptionManager.encryptProviderConfig(config);
        encrypted.missing_fields = this.validateProviderConfig(provider.auth_mode, encrypted);

        return db.knex
            .from<ProviderConfig>(`_nango_configs`)
            .where({ id: config.id!, environment_id: config.environment_id, deleted: false })
            .update(encrypted);
    }

    async editProviderConfigName(providerConfigKey: string, newUniqueKey: string, environment_id: number) {
        return db.knex
            .from<ProviderConfig>(`_nango_configs`)
            .where({ unique_key: providerConfigKey, environment_id, deleted: false })
            .update({ unique_key: newUniqueKey });
    }

    async getConfigIdByProvider(provider: string, environment_id: number): Promise<{ id: number; unique_key: string } | null> {
        const result = await db.knex
            .select('id', 'unique_key')
            .from<ProviderConfig>(`_nango_configs`)
            .where({ provider, environment_id, deleted: false })
            .first();

        if (!result) {
            return null;
        }

        return result;
    }

    async getConfigIdByProviderConfigKey(providerConfigKey: string, environment_id: number): Promise<number | null> {
        const result = await db.knex
            .select('id')
            .from<ProviderConfig>(`_nango_configs`)
            .where({ unique_key: providerConfigKey, environment_id, deleted: false })
            .first();

        if (!result) {
            return null;
        }

        return result.id;
    }

    async copyProviderConfigCreds(
        fromEnvironmentId: number,
        toEnvironmentId: number,
        providerConfigKey: string
    ): Promise<{ copiedToId: number; copiedFromId: number } | null> {
        const fromConfig = await this.getProviderConfig(providerConfigKey, fromEnvironmentId);

        if (!fromConfig || !fromConfig.id) {
            return null;
        }

        const { id: foundConfigId, ...configWithoutId } = fromConfig;
        const providerConfigResponse = await this.createProviderConfig({
            ...configWithoutId,
            environment_id: toEnvironmentId,
            unique_key: fromConfig.unique_key
        });

        if (!providerConfigResponse) {
            return null;
        }

        return { copiedToId: providerConfigResponse.id!, copiedFromId: foundConfigId };
    }

    VALIDATION_RULES: ValidationRule[] = [
        {
            field: 'oauth_client_id',
            modes: ['OAUTH1', 'OAUTH2', 'TBA', 'APP'],
            isValid: (config) => !!config.oauth_client_id
        },
        {
            field: 'oauth_client_secret',
            modes: ['OAUTH1', 'OAUTH2', 'TBA', 'APP'],
            isValid: (config) => !!config.oauth_client_secret
        },
        {
            field: 'app_link',
            modes: ['APP'],
            isValid: (config) => !!config.app_link
        }
    ];

    validateProviderConfig(authMode: AuthModeType, providerConfig: ProviderConfig): string[] {
        return this.VALIDATION_RULES.filter((rule) => rule.modes.includes(authMode))
            .filter((rule) => !rule.isValid(providerConfig))
            .map((rule) => rule.field.toString());
    }
}

export default new ConfigService();
