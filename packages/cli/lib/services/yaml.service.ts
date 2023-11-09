import type { StandardNangoConfig } from '@nangohq/shared';
import { loadSimplifiedConfig, nangoConfigFile } from '@nangohq/shared';
import { printDebug } from '../utils.js';

class YamlService {
    public async getConfig(optionalLoadLocation = '', debug = false): Promise<StandardNangoConfig[]> {
        const loadLocation = optionalLoadLocation || './';
        const config = await loadSimplifiedConfig(loadLocation);

        if (!config) {
            throw new Error(`Error loading the ${nangoConfigFile} file`);
        }

        if (debug) {
            printDebug(`Config file file found`);
        }

        return config;
    }

    public getModelNames(config: StandardNangoConfig[]): string[] {
        const modelNames = config.reduce((acc: string[], config) => {
            const syncs = config.syncs || [];
            const actions = config.actions || [];
            const allSyncs = [...syncs, ...actions];
            const models = allSyncs.reduce((acc: string[], sync) => {
                const models = sync.models || [];
                const names = models.map((model) => model.name);
                return [...acc, ...names];
            }, []);
            return [...acc, ...models];
        }, []);

        return modelNames;
    }
}

const yamlService = new YamlService();
export default yamlService;
