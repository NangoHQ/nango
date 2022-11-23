import path from 'path';
import fs from 'fs';
import type { IntegrationTemplate } from './types.js';
import type { Integration } from './integration.model.js';
import db from './database.js';

class IntegrationsManager {
    getIntegrationTemplate(integrationName: string): IntegrationTemplate {
        // TODO: fetch the integration config to have the integration type.
        const integrationPath = path.join('../../../integrations', `${integrationName}.json`); // TODO: make compatible with Docker
        return JSON.parse(fs.readFileSync(integrationPath, 'utf-8'));
    }

    async getIntegrationConfig(integrationName: string): Promise<Integration | null> {
        let result = await db.knex.withSchema(db.schema()).select('*').from(`_pizzly_integrations`).where({ integration_id: integrationName });

        if (result == null || result.length == 0 || result[0] == null) {
            return null;
        }

        return {
            id: result[0].id,
            name: result[0].integration_id,
            type: result[0].type,
            oauth_client_id: result[0].oauth_client_id || undefined,
            oauth_client_secret: result[0].oauth_client_secret || undefined,
            oauth_scopes: result[0].oauth_scopes != null ? result[0].oauth_scopes.split(',') : undefined
        };
    }
}

export default new IntegrationsManager();
