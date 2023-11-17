import yaml from 'js-yaml';
import path from 'path';
import fs from 'fs';
import { dirname } from '../utils/utils.js';
import { getPublicConfig } from './sync/config/config.service.js';
import type { NangoIntegration, NangoIntegrationData, NangoModelV1 } from '../models/NangoConfig.js';

export interface Config {
    integrations: NangoIntegration & NangoModelV1;
}

class FlowService {
    public getAllAvailableFlows(): Config {
        try {
            const flowPath = path.join(dirname(), '../../../flows.yaml');
            const flows = yaml.load(fs.readFileSync(flowPath).toString());

            return flows as Config;
        } catch (_e) {
            return {} as Config;
        }
    }

    public getFlow(name: string) {
        const integrations = this.getAllAvailableFlows()['integrations'];

        for (const providerName in integrations) {
            const allFlows = integrations[providerName];
            if (allFlows) {
                const flow = allFlows[name] as NangoIntegrationData;
                if (flow) {
                    const models = flow['returns'] as string[];

                    const model_schema = models.map((modelName: string) => {
                        const allModels = allFlows['models'] as NangoModelV1['models'];
                        const modelDetails = allModels[modelName] as Record<string, string>;
                        return {
                            name: modelName,
                            fields: Object.keys(modelDetails).map((field: string) => ({
                                name: field,
                                type: modelDetails[field]
                            }))
                        };
                    });

                    return { ...flow, model_schema };
                }
            }
        }

        return null;
    }

    public async getAddedPublicFlows(environmentId: number) {
        return getPublicConfig(environmentId);
    }
}

export default new FlowService();
