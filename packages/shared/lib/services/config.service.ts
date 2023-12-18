import type { Config as ProviderConfig, Template as ProviderTemplate, TemplateAlias as ProviderTemplateAlias } from '../models/Provider.js';
import type { Connection } from '../models/Connection.js';
import db from '../db/database.js';
import yaml from 'js-yaml';
import fs from 'fs';
import path from 'path';
import { isCloud, dirname } from '../utils/utils.js';
import { NangoError } from '../utils/error.js';
import encryptionManager from '../utils/encryption.manager.js';
import syncOrchestrator from './sync/orchestrator.service.js';
import { deleteSyncFilesForConfig, deleteByConfigId as deleteSyncConfigByConfigId } from '../services/sync/config/config.service.js';
import environmentService from '../services/environment.service.js';

class ConfigService {
    templates: { [key: string]: ProviderTemplate } | null;

    constructor() {
        this.templates = this.getTemplatesFromFile();
    }

    public DEMO_GITHUB_CONFIG_KEY = 'demo-github-integration';

    private getTemplatesFromFile() {
        const templatesPath = path.join(dirname(), '../../../providers.yaml');

        try {
            const fileEntries = yaml.load(fs.readFileSync(templatesPath).toString()) as { [key: string]: ProviderTemplate | ProviderTemplateAlias };

            if (fileEntries == null) {
                throw new NangoError('provider_template_loading_failed');
            }

            for (const key in fileEntries) {
                const entry = fileEntries[key] as ProviderTemplateAlias;

                if (entry?.alias) {
                    let hasOverrides = false;
                    let templateOverrides;
                    if (Object.keys(fileEntries[key] as ProviderTemplate).length > 0) {
                        const { alias, ...overrides } = entry as ProviderTemplateAlias;
                        hasOverrides = true;
                        templateOverrides = overrides;
                    }
                    const aliasData = fileEntries[entry.alias] as ProviderTemplate;
                    if (hasOverrides) {
                        fileEntries[key] = { ...aliasData, ...templateOverrides };
                    }
                }
            }

            return fileEntries as { [key: string]: ProviderTemplate };
        } catch (_) {
            return null;
        }
    }

    async getProviderName(providerConfigKey: string): Promise<string | null> {
        const result = await db.knex
            .withSchema(db.schema())
            .select('provider')
            .from<ProviderConfig>(`_nango_configs`)
            .where({ unique_key: providerConfigKey, deleted: false });

        if (result == null || result.length == 0 || result[0] == null) {
            return null;
        }

        return result[0].provider;
    }

    async getIdByProviderConfigKey(environment_id: number, providerConfigKey: string): Promise<number | null> {
        const result = await db.knex
            .withSchema(db.schema())
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
        if (!providerConfigKey) {
            throw new NangoError('missing_provider_config');
        }
        if (environment_id === null || environment_id === undefined) {
            throw new NangoError('missing_environment_id');
        }

        const result = await db.knex
            .withSchema(db.schema())
            .select('*')
            .from<ProviderConfig>(`_nango_configs`)
            .where({ unique_key: providerConfigKey, environment_id, deleted: false });

        if (result == null || result.length == 0 || result[0] == null) {
            return null;
        }

        return encryptionManager.decryptProviderConfig(result[0]);
    }

    async listProviderConfigs(environment_id: number): Promise<ProviderConfig[]> {
        return (await db.knex.withSchema(db.schema()).select('*').from<ProviderConfig>(`_nango_configs`).where({ environment_id, deleted: false }))
            .map((config) => encryptionManager.decryptProviderConfig(config))
            .filter((config) => config != null) as ProviderConfig[];
    }

    async createProviderConfig(config: ProviderConfig): Promise<void | Pick<ProviderConfig, 'id'>[]> {
        const configToInsert = config.oauth_client_secret ? encryptionManager.encryptProviderConfig(config) : config;
        return db.knex.withSchema(db.schema()).from<ProviderConfig>(`_nango_configs`).insert(configToInsert, ['id']);
    }

    /**
     * Create Default Provider Config
     * @desc create a default Github config only for the dev environment
     */
    async createDefaultProviderConfig(accountId: number) {
        const environments = await db.knex.withSchema(db.schema()).select('*').from(`_nango_environments`).where({ account_id: accountId, name: 'dev' });
        const devEnvironment = environments[0];

        const config: ProviderConfig = {
            environment_id: devEnvironment.id,
            unique_key: this.DEMO_GITHUB_CONFIG_KEY,
            provider: 'github',
            oauth_client_id: process.env['DEFAULT_GITHUB_CLIENT_ID'] || '',
            oauth_client_secret: process.env['DEFAULT_GITHUB_CLIENT_SECRET'] || '',
            oauth_scopes: 'public_repo'
        };

        await this.createProviderConfig(config);
    }

    async createDefaultProviderConfigIfNotExisting(accountId: number) {
        const environments = await db.knex.withSchema(db.schema()).select('*').from(`_nango_environments`).where({ account_id: accountId, name: 'dev' });
        const devEnvironment = environments[0];

        const existingConfig = await this.getProviderConfig(this.DEMO_GITHUB_CONFIG_KEY, devEnvironment.id);

        if (existingConfig == null) {
            await this.createDefaultProviderConfig(accountId);
        }
    }

    async deleteProviderConfig(providerConfigKey: string, environment_id: number): Promise<number> {
        const idResult = (
            await db.knex
                .withSchema(db.schema())
                .select('id')
                .from<ProviderConfig>(`_nango_configs`)
                .where({ unique_key: providerConfigKey, environment_id, deleted: false })
        )[0];

        if (!idResult) {
            throw new NangoError('unknown_provider_config');
        }

        const { id } = idResult;

        await syncOrchestrator.deleteSyncsByProviderConfig(environment_id, providerConfigKey);

        if (isCloud()) {
            const config = await this.getProviderConfig(providerConfigKey, environment_id);
            await deleteSyncFilesForConfig(config?.id as number, environment_id);
        }

        await deleteSyncConfigByConfigId(id);

        await db.knex
            .withSchema(db.schema())
            .from<ProviderConfig>(`_nango_configs`)
            .where({ id, deleted: false })
            .update({ deleted: true, deleted_at: new Date() });

        return db.knex
            .withSchema(db.schema())
            .from<Connection>(`_nango_connections`)
            .where({ provider_config_key: providerConfigKey, environment_id, deleted: false })
            .update({ deleted: true, deleted_at: new Date() });
    }

    async editProviderConfig(config: ProviderConfig) {
        return db.knex
            .withSchema(db.schema())
            .from<ProviderConfig>(`_nango_configs`)
            .where({ unique_key: config.unique_key, environment_id: config.environment_id, deleted: false })
            .update(encryptionManager.encryptProviderConfig(config));
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

    getTemplates(): { [key: string]: ProviderTemplate } {
        if (this.templates == null) {
            throw new NangoError('provider_template_loading_failed');
        }
        return this.templates;
    }

    async getConfigIdByProvider(provider: string, environment_id: number): Promise<{ id: number; unique_key: string } | null> {
        const result = await db.knex
            .withSchema(db.schema())
            .select('id', 'unique_key')
            .from<ProviderConfig>(`_nango_configs`)
            .where({ provider, environment_id, deleted: false })
            .first();

        if (!result) {
            return null;
        }

        return result;
    }
}

export default new ConfigService();
