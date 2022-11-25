import type { IntegrationConfig } from '../models.js';
import db from '../db/database.js';

class ConfigService {
    async getIntegrationConfig(integrationKey: string): Promise<IntegrationConfig | null> {
        let result = await db.knex.withSchema(db.schema()).select('*').from(`_pizzly_configs`).where({ unique_key: integrationKey });

        if (result == null || result.length == 0 || result[0] == null) {
            return null;
        }

        return result[0];
    }

    async listIntegrationConfigs(): Promise<IntegrationConfig[]> {
        return await db.knex.withSchema(db.schema()).select('*').from<IntegrationConfig>(`_pizzly_configs`);
    }

    async createIntegrationConfig(config: IntegrationConfig): Promise<void | Pick<IntegrationConfig, 'id'>[]> {
        return await db.knex.withSchema(db.schema()).from<IntegrationConfig>(`_pizzly_configs`).insert(config, ['id']);
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
