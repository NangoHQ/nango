import type { Config as ProviderConfig, TemplateAlias as ProviderTemplateAlias } from '../models/Provider.js';
import type { Connection } from '../models/Connection.js';
import type { Template as ProviderTemplate } from '@nangohq/types';
import db from '@nangohq/database';
import yaml from 'js-yaml';
import fs from 'fs';
import path from 'path';
import { isCloud, nanoid } from '@nangohq/utils';
import { dirname } from '../utils/utils.js';
import { NangoError } from '../utils/error.js';
import encryptionManager from '../utils/encryption.manager.js';
import syncManager from './sync/manager.service.js';
import { deleteSyncFilesForConfig, deleteByConfigId as deleteSyncConfigByConfigId } from '../services/sync/config/config.service.js';
import environmentService from '../services/environment.service.js';
import type { Orchestrator } from '../clients/orchestrator.js';

class ConfigService {
    templates: Record<string, ProviderTemplate> | null;

    constructor() {
        this.templates = this.getTemplatesFromFile();
    }

    private getTemplatesFromFile() {
        const templatesPath = () => {
            // find the providers.yaml file
            // recursively searching in parent directories
            const findProvidersYaml = (dir: string): string => {
                const providersYamlPath = path.join(dir, 'providers.yaml');
                if (fs.existsSync(providersYamlPath)) {
                    return providersYamlPath;
                }
                const parentDir = path.dirname(dir);
                if (parentDir === dir) {
                    throw new NangoError('providers_yaml_not_found');
                }
                return findProvidersYaml(parentDir);
            };
            return findProvidersYaml(dirname());
        };

        try {
            const fileEntries = yaml.load(fs.readFileSync(templatesPath()).toString()) as Record<string, ProviderTemplate | ProviderTemplateAlias>;

            if (fileEntries == null) {
                throw new NangoError('provider_template_loading_failed');
            }

            for (const key in fileEntries) {
                const entry = fileEntries[key] as ProviderTemplateAlias | undefined;

                if (entry?.alias) {
                    let hasOverrides = false;
                    let templateOverrides: ProviderTemplateAlias;
                    if (Object.keys(fileEntries[key] as ProviderTemplate).length > 0) {
                        const { alias, ...overrides } = entry;
                        hasOverrides = true;
                        templateOverrides = overrides;
                    }
                    const aliasData = fileEntries[entry.alias] as ProviderTemplate;
                    if (hasOverrides) {
                        fileEntries[key] = { ...aliasData, ...templateOverrides! };
                    }
                }
            }

            return fileEntries as Record<string, ProviderTemplate>;
        } catch (_) {
            return null;
        }
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
        return (await db.knex.select('*').from<ProviderConfig>(`_nango_configs`).where({ environment_id, deleted: false }))
            .map((config) => encryptionManager.decryptProviderConfig(config))
            .filter((config) => config != null) as ProviderConfig[];
    }

    async listProviderConfigsByProvider(environment_id: number, provider: string): Promise<ProviderConfig[]> {
        return (await db.knex.select('*').from<ProviderConfig>(`_nango_configs`).where({ environment_id, provider, deleted: false }))
            .map((config) => encryptionManager.decryptProviderConfig(config))
            .filter((config) => config != null) as ProviderConfig[];
    }

    async getAllNames(environment_id: number): Promise<string[]> {
        const configs = await this.listProviderConfigs(environment_id);
        return configs.map((config) => config.unique_key);
    }

    async createProviderConfig(config: ProviderConfig): Promise<void | Pick<ProviderConfig, 'id'>[]> {
        const configToInsert = config.oauth_client_secret ? encryptionManager.encryptProviderConfig(config) : config;
        return db.knex.from<ProviderConfig>(`_nango_configs`).insert(configToInsert, ['id']);
    }

    async createEmptyProviderConfig(provider: string, environment_id: number): Promise<Pick<ProviderConfig, 'id' | 'unique_key'>> {
        const exists = await db.knex
            .count<{ count: string }>('*')
            .from<ProviderConfig>(`_nango_configs`)
            .where({ provider, environment_id, deleted: false })
            .first();

        const config = {
            environment_id,
            unique_key: exists?.count === '0' ? provider : `${provider}-${nanoid(4).toLocaleLowerCase()}`,
            provider
        };

        const id = await this.createProviderConfig(config as ProviderConfig);

        if (!id || id.length === 0) {
            throw new NangoError('unknown_provider_config');
        }

        return { id: id[0]?.id, unique_key: config.unique_key } as Pick<ProviderConfig, 'id' | 'unique_key'>;
    }

    async deleteProviderConfig(providerConfigKey: string, environment_id: number, orchestrator: Orchestrator): Promise<number> {
        const idResult = (
            await db.knex.select('id').from<ProviderConfig>(`_nango_configs`).where({ unique_key: providerConfigKey, environment_id, deleted: false })
        )[0];

        if (!idResult) {
            throw new NangoError('unknown_provider_config');
        }

        const { id } = idResult;

        await syncManager.deleteSyncsByProviderConfig(environment_id, providerConfigKey, orchestrator);

        if (isCloud) {
            const config = await this.getProviderConfig(providerConfigKey, environment_id);
            await deleteSyncFilesForConfig(config?.id as number, environment_id);
        }

        await deleteSyncConfigByConfigId(id);

        await db.knex.from<ProviderConfig>(`_nango_configs`).where({ id, deleted: false }).update({ deleted: true, deleted_at: new Date() });

        return db.knex
            .from<Connection>(`_nango_connections`)
            .where({ provider_config_key: providerConfigKey, environment_id, deleted: false })
            .update({ deleted: true, deleted_at: new Date() });
    }

    async editProviderConfig(config: ProviderConfig) {
        return db.knex
            .from<ProviderConfig>(`_nango_configs`)
            .where({ unique_key: config.unique_key, environment_id: config.environment_id, deleted: false })
            .update(encryptionManager.encryptProviderConfig(config));
    }

    async editProviderConfigName(providerConfigKey: string, newUniqueKey: string, environment_id: number) {
        return db.knex
            .from<ProviderConfig>(`_nango_configs`)
            .where({ unique_key: providerConfigKey, environment_id, deleted: false })
            .update({ unique_key: newUniqueKey });
    }

    checkProviderTemplateExists(provider: string) {
        if (this.templates == null) {
            throw new NangoError('provider_template_loading_failed');
        }
        return provider in this.templates;
    }

    getTemplate(provider: string): ProviderTemplate {
        if (this.templates == null) {
            throw new NangoError('unknown_provider_template_in_config');
        }
        const template = this.templates[provider];

        if (template == null) {
            throw new NangoError('unknown_provider_template_in_config');
        }

        return template;
    }

    getTemplates(): Record<string, ProviderTemplate> {
        if (this.templates == null) {
            throw new NangoError('provider_template_loading_failed');
        }
        return this.templates;
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
}

export default new ConfigService();
