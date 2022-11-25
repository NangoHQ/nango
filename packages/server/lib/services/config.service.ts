import path from 'path';
import fs from 'fs';
import type { IntegrationConfig, IntegrationTemplate } from '../models.js';
import db from '../db/database.js';
import * as yaml from 'js-yaml';

class ConfigService {
    getIntegrationTemplate(integrationType: string): IntegrationTemplate {
        const integrationPath = path.join(process.env['PIZZLY_INTEGRATIONS_FOLDER'] || '../../integrations', `${integrationType}.yaml`);
        return yaml.load(fs.readFileSync(integrationPath));
    }

    async getIntegrationConfig(integrationKey: string): Promise<IntegrationConfig | null> {
        let result = await db.knex.withSchema(db.schema()).select('*').from(`_pizzly_configs`).where({ unique_key: integrationKey });

        if (result == null || result.length == 0 || result[0] == null) {
            return null;
        }

        return {
            id: result[0].id,
            unique_key: result[0].unique_key,
            type: result[0].type,
            oauth_client_id: result[0].oauth_client_id || undefined,
            oauth_client_secret: result[0].oauth_client_secret || undefined,
            oauth_scopes: result[0].oauth_scopes != null ? result[0].oauth_scopes.split(',') : undefined
        };
    }

    async listIntegrationConfigs(): Promise<IntegrationConfig[]> {
        return await db.knex.withSchema(db.schema()).select('*').from<IntegrationConfig>(`_pizzly_configs`);
    }

    async createIntegrationConfig(config: IntegrationConfig): Promise<void | Pick<IntegrationConfig, 'id'>[]> {
        return await db.knex.withSchema(db.schema()).insert(config, ['id']).into<IntegrationConfig>(`_pizzly_configs`);
    }

    async deleteIntegrationConfig(integrationKey: string): Promise<number> {
        return db.knex.withSchema(db.schema()).from<IntegrationConfig>(`_pizzly_configs`).where('unique_key', integrationKey).del();
    }

    async editIntegrationConfig(config: IntegrationConfig) {
        await db.knex.withSchema(db.schema()).from<IntegrationConfig>(`_pizzly_configs`).where({ unique_key: config.unique_key }).update({
            type: config.type,
            oauth_client_id: config.oauth_client_id,
            oauth_client_secret: config.oauth_client_secret,
            oauth_scopes: config.oauth_scopes
        });
    }
}

export default new ConfigService();
