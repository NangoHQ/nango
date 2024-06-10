import fs from 'fs';
import Ajv from 'ajv';
import addErrors from 'ajv-errors';
import chalk from 'chalk';
import type { StandardNangoConfig, ServiceResponse } from '@nangohq/shared';
import { loadLocalNangoConfig, loadStandardConfig, nangoConfigFile, determineVersion, NangoError } from '@nangohq/shared';
import { getNangoRootPath, printDebug } from '../utils.js';

class ConfigService {
    public async load(loadLocation: string, debug = false): Promise<ServiceResponse<StandardNangoConfig[]>> {
        if (debug) {
            printDebug(`Loading ${loadLocation}`);
        }

        const localConfig = await loadLocalNangoConfig(loadLocation);
        if (!localConfig) {
            return { success: false, error: new NangoError('error_loading_nango_config'), response: null };
        }

        const { success: validationSuccess, error: validationError } = this.validate(localConfig);
        if (!validationSuccess) {
            return { success: false, error: validationError, response: null };
        }

        const { success, error, response: config } = loadStandardConfig(localConfig, true);
        if (!success || !config) {
            return { success: false, error, response: null };
        }

        if (debug) {
            printDebug(`Config file found`);
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

    /**
     * Output validation errors to console
     */
    validate(yaml: any): ServiceResponse<null> {
        const errors = validateYaml(yaml);
        if (errors.length <= 0) {
            return { success: true, error: null, response: null };
        }

        const messages = [];
        for (const error of errors) {
            if (error.path) {
                messages.push(chalk.underline(chalk.white(error.path.substring(1).split('/').join(' > '))));
            }
            messages.push(`  ${chalk.red('error')} ${error.msg}${error.code ? chalk.dim(` [${error.code}]`) : ''}`);

            if (error.params) {
                for (const [key, val] of Object.entries(error.params)) {
                    messages.push(chalk.dim(`  ${key}: ${val}`));
                }
            }
            messages.push('');
        }

        console.log(`${chalk.red(`${nangoConfigFile} validation failed`)}\n\n${messages.join('\n')}`);

        const error = new NangoError('pass_through_error', `Problem validating the ${nangoConfigFile} file.`);
        return { success: false, error, response: null };
    }
}

export interface ValidationMessage {
    msg: string;
    path?: string;
    code?: string | undefined;
    params?: Record<string, any> | undefined;
}
/**
 * Use AJV to validate a nango.yaml against json schema
 */
export function validateYaml(yaml: any): ValidationMessage[] {
    const ajv = new Ajv({ allErrors: true });
    addErrors(ajv);

    if (!yaml || !('integrations' in yaml)) {
        return [
            {
                msg: 'Invalid file format, you should have at least an `integrations` property at the root level. Check our documentation https://docs.nango.dev/reference/integration-configuration'
            }
        ];
    }
    const version = determineVersion(yaml);
    const validationFile = version === 'v1' ? 'nango.yaml.schema.v1.json' : 'nango.yaml.schema.v2.json';

    const schema = fs.readFileSync(`${getNangoRootPath()}/lib/${validationFile}`, 'utf8');
    const validate = ajv.compile(JSON.parse(schema));

    if (validate(yaml)) {
        return [];
    }

    const messages: ValidationMessage[] = [];
    for (const error of validate.errors!) {
        if (!error.message || error.message === ' ') {
            continue;
        }
        const code = error.keyword !== 'errorMessage' ? error.keyword : undefined;
        messages.push({
            msg: error.message,
            path: error.instancePath,
            code,
            params: error.params && Object.keys(error.params).length > 0 && !('errors' in error.params) ? error.params : undefined
        });
    }

    return messages;
}

const configService = new ConfigService();
export default configService;
