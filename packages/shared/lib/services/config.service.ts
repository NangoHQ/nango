import db from '@nangohq/database';
import { isCloud, nanoid } from '@nangohq/utils';

import { getProvider } from './providers.js';
import encryptionManager from '../utils/encryption.manager.js';
import { NangoError } from '../utils/error.js';
import syncManager from './sync/manager.service.js';
import { deleteByConfigId as deleteSyncConfigByConfigId, deleteSyncFilesForConfig } from '../services/sync/config/config.service.js';

import type { Orchestrator } from '../clients/orchestrator.js';
import type { Config as ProviderConfig } from '../models/Provider.js';
import type { Knex } from '@nangohq/database';
import type { AuthModeType, DBConnection, DBCreateIntegration, DBIntegrationCrypted, IntegrationConfig, Provider } from '@nangohq/types';

interface ValidationRule {
    field: keyof ProviderConfig | 'app_id' | 'private_key';
    modes: AuthModeType[];
    isValid(config: ProviderConfig): boolean;
}

class ConfigService {
    async getIdByProviderConfigKey(environment_id: number, providerConfigKey: string): Promise<number | null> {
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

    async getProviderConfig(providerConfigKey: string, environment_id: number, trx = db.readOnly): Promise<ProviderConfig | null> {
        const result = await trx
            .select('*')
            .from<ProviderConfig>(`_nango_configs`)
            .where({ unique_key: providerConfigKey, environment_id, deleted: false })
            .first();

        if (!result) {
            return null;
        }

        return encryptionManager.decryptProviderConfig(result);
    }

    async listProviderConfigs(trx: Knex, environment_id: number): Promise<ProviderConfig[]> {
        return (
            await trx
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

    async createProviderConfig(config: DBCreateIntegration, provider: Provider): Promise<IntegrationConfig | null> {
        const configToInsert = config.oauth_client_secret ? encryptionManager.encryptProviderConfig(config as ProviderConfig) : config;
        configToInsert.missing_fields = this.validateProviderConfig(provider.auth_mode, config as ProviderConfig);
        if (!configToInsert.oauth_scopes && provider.default_scopes?.length) {
            configToInsert.oauth_scopes = provider.default_scopes.join(',');
        }
        const res = await db.knex.from<IntegrationConfig>(`_nango_configs`).insert(configToInsert).returning('*');
        return res[0] ?? null;
    }

    async createEmptyProviderConfig(providerName: string, environment_id: number, provider: Provider): Promise<IntegrationConfig> {
        const exists = await db.knex
            .count<{ count: string }>('*')
            .from<ProviderConfig>(`_nango_configs`)
            .where({ provider: providerName, environment_id, deleted: false })
            .first();

        const config = await this.createProviderConfig(
            {
                environment_id,
                unique_key: exists?.count === '0' ? providerName : `${providerName}-${nanoid(4).toLocaleLowerCase()}`,
                provider: providerName,
                forward_webhooks: true
            },
            provider
        );

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
        // TODO: might be useless since we are dropping the data after a while
        await syncManager.deleteSyncsByProviderConfig(environmentId, providerConfigKey, orchestrator);

        if (isCloud) {
            await deleteSyncFilesForConfig(id, environmentId);
        }

        // TODO: might be useless since we are dropping the data after a while
        await deleteSyncConfigByConfigId(id);

        const updated = await db.knex.from<ProviderConfig>(`_nango_configs`).where({ id, deleted: false }).update({ deleted: true, deleted_at: new Date() });
        if (updated <= 0) {
            return false;
        }

        // TODO: might be useless since we are dropping the data after a while
        await db.knex
            .from<DBConnection>(`_nango_connections`)
            .where({ provider_config_key: providerConfigKey, environment_id: environmentId, deleted: false })
            .update({ deleted: true, deleted_at: new Date() });
        return true;
    }

    async editProviderConfig(config: ProviderConfig, provider: Provider): Promise<DBIntegrationCrypted> {
        const encrypted = encryptionManager.encryptProviderConfig(config);
        encrypted.missing_fields = this.validateProviderConfig(provider.auth_mode, config);
        encrypted.updated_at = new Date();

        const res = await db.knex
            .from<DBIntegrationCrypted>(`_nango_configs`)
            .where({ id: config.id!, environment_id: config.environment_id, deleted: false })
            .update(encrypted)
            .returning('*');
        return res[0]!;
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

    async copyProviderConfigCreds(
        fromEnvironmentId: number,
        toEnvironmentId: number,
        providerConfigKey: string
    ): Promise<{ copiedToId: number; copiedFromId: number } | null> {
        const fromConfig = await this.getProviderConfig(providerConfigKey, fromEnvironmentId);
        if (!fromConfig || !fromConfig.id) {
            return null;
        }

        const provider = getProvider(fromConfig.provider);
        if (!provider) {
            throw new NangoError('unknown_provider');
        }

        const { id: foundConfigId, ...configWithoutId } = fromConfig;
        const providerConfigResponse = await this.createProviderConfig(
            {
                ...configWithoutId,
                environment_id: toEnvironmentId,
                unique_key: fromConfig.unique_key
            },
            provider
        );

        if (!providerConfigResponse) {
            return null;
        }

        return { copiedToId: providerConfigResponse.id!, copiedFromId: foundConfigId };
    }

    async getSoftDeleted({ limit, olderThan }: { limit: number; olderThan: number }): Promise<IntegrationConfig[]> {
        const dateThreshold = new Date();
        dateThreshold.setDate(dateThreshold.getDate() - olderThan);

        return await db.knex
            .select('*')
            .from<IntegrationConfig>(`_nango_configs`)
            .where('deleted', true)
            .andWhere('deleted_at', '<=', dateThreshold.toISOString())
            .limit(limit);
    }

    async hardDelete(id: number): Promise<void> {
        await db.knex.from<ProviderConfig>(`_nango_configs`).where({ id }).delete();
    }

    VALIDATION_RULES: ValidationRule[] = [
        {
            field: 'oauth_client_id',
            modes: ['OAUTH1', 'OAUTH2', 'TBA', 'APP', 'CUSTOM'],
            isValid: (config) => !!config.oauth_client_id
        },
        {
            field: 'oauth_client_secret',
            modes: ['OAUTH1', 'OAUTH2', 'TBA', 'APP', 'CUSTOM'],
            isValid: (config) => !!config.oauth_client_secret
        },
        {
            field: 'app_link',
            modes: ['APP', 'CUSTOM'],
            isValid: (config) => !!config.app_link
        },
        {
            field: 'app_id',
            modes: ['CUSTOM'],
            isValid: (config) => !!config.custom?.['app_id']
        },
        {
            field: 'private_key',
            modes: ['CUSTOM'],
            isValid: (config) => !!config.custom?.['private_key']
        }
    ];

    validateProviderConfig(authMode: AuthModeType, providerConfig: ProviderConfig): string[] {
        return this.VALIDATION_RULES.flatMap((rule) => (rule.modes.includes(authMode) && !rule.isValid(providerConfig) ? [rule.field] : []));
    }
}

export default new ConfigService();
