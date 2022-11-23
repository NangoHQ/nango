import path from 'path';
import fs from 'fs';
import type { PizzlyIntegrationTemplate, PizzlyIntegrationConfig } from './types.js';

class IntegrationsManager {
    public getIntegrationTemplate(integrationName: string): PizzlyIntegrationTemplate {
        const integrationPath = path.join('../../../integrations', `${integrationName}.json`); // TODO: make compatible with Docker
        return JSON.parse(fs.readFileSync(integrationPath, 'utf-8'));
    }

    public getIntegrationConfig(): PizzlyIntegrationConfig {
        return {}; // TODO: fill out
    }
}

export default new IntegrationsManager();
