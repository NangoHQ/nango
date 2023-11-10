import fs from 'fs';
import Ajv from 'ajv';
import chalk from 'chalk';
import type { NangoConfig, StandardNangoConfig, ServiceResponse } from '@nangohq/shared';
import { loadLocalNangoConfig, loadStandardConfig, nangoConfigFile, determineVersion, NangoError } from '@nangohq/shared';
import { getNangoRootPath, printDebug } from '../utils.js';

class ConfigService {
    public async load(optionalLoadLocation = '', debug = false): Promise<ServiceResponse<StandardNangoConfig[]>> {
        const loadLocation = optionalLoadLocation || './';
        const localConfig = await loadLocalNangoConfig(loadLocation);

        if (!localConfig) {
            return { success: false, error: new NangoError('error_loading_nango_config'), response: null };
        }

        this.validate(localConfig);
        const { success, error, response: config } = loadStandardConfig(localConfig, true);

        if (!success || !config) {
            return { success: false, error, response: null };
        }

        if (debug) {
            printDebug(`Config file file found`);
        }

        return { success: true, error: null, response: config };
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

    private validate(config: NangoConfig): void {
        const ajv = new Ajv();
        if (!config || !config.integrations) {
            return;
        }

        if (config.integrations['syncs'] || config.integrations['actions']) {
            throw new Error(`The ${nangoConfigFile} file has an invalid format, syncs or actions should be nested under a provider config key.`);
        }

        const version = determineVersion(config);
        const validationFile = version === 'v1' ? 'nango.yaml.schema.v1.json' : 'nango.yaml.schema.v2.json';

        const schema = fs.readFileSync(`${getNangoRootPath()}/lib/${validationFile}`, 'utf8');
        const validate = ajv.compile(JSON.parse(schema));

        if (!validate(config)) {
            console.log(chalk.red(`yaml validation failed with ${JSON.stringify(validate.errors, null, 2)}`));
            throw new Error(`Error validating the ${nangoConfigFile} file`);
        }
    }
}

const configService = new ConfigService();
export default configService;
