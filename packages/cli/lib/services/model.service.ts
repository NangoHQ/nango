import fs from 'fs';
import yaml from 'js-yaml';
import chalk from 'chalk';
import type { NangoConfig, NangoModel, NangoIntegration, NangoIntegrationData } from '@nangohq/shared';
import { isJsOrTsType, SyncConfigType, nangoConfigFile } from '@nangohq/shared';
import { printDebug, getNangoRootPath } from '../utils.js';
import { TYPES_FILE_NAME, NangoSyncTypesFileLocation } from '../constants.js';
import configService from './config.service.js';

class ModelService {
    public build(models: NangoModel, integrations: NangoIntegration, debug = false): (string | undefined)[] | null {
        const returnedModels = Object.keys(integrations).reduce<string[]>((acc, providerConfigKey) => {
            const syncObject = integrations[providerConfigKey] as unknown as Record<string, NangoIntegration>;
            const syncNames = Object.keys(syncObject);
            for (const syncName of syncNames) {
                const syncData = syncObject[syncName] as unknown as NangoIntegrationData;
                if (syncData.returns) {
                    const syncReturns = Array.isArray(syncData.returns) ? syncData.returns : [syncData.returns];
                    syncReturns.forEach((modelName) => {
                        if (!acc.includes(modelName)) {
                            acc.push(modelName);
                        }
                    });
                }
            }
            return acc;
        }, []);

        if (!models) {
            return null;
        }

        const interfaceDefinitions = Object.keys(models).map((modelName: string) => {
            const fields = models[modelName] as NangoModel;

            // we only care that models that are returned have an ID field
            // if the model is not returned from a sync script then it must be a
            // helper model that is used to build the returned models
            const syncForModel = Object.keys(integrations).find((providerConfigKey) => {
                const syncObject = integrations[providerConfigKey] as unknown as Record<string, NangoIntegration>;
                const syncNames = Object.keys(syncObject);
                for (const syncName of syncNames) {
                    const syncData = syncObject[syncName] as unknown as NangoIntegrationData;
                    if (syncData.returns && syncData.type !== SyncConfigType.ACTION) {
                        return syncData.returns.includes(modelName);
                    }
                }
                return false;
            });

            if (returnedModels.includes(modelName) && !fields['id'] && syncForModel) {
                throw new Error(`Model "${modelName}" doesn't have an id field. This is required to be able to uniquely identify the data record.`);
            }

            const interfaceName = `${modelName.charAt(0).toUpperCase()}${modelName.slice(1)}`;
            let extendsClause = '';
            const fieldDefinitions = Object.keys(fields)
                .filter((fieldName: string) => {
                    if (fieldName === '__extends') {
                        const fieldModel = fields[fieldName] as unknown as string;
                        const multipleExtends = fieldModel.split(',').map((e) => e.trim());
                        extendsClause = ` extends ${multipleExtends.join(', ')}`;
                        return false;
                    }
                    return true;
                })
                .map((fieldName: string) => {
                    const fieldModel = fields[fieldName] as string | NangoModel;
                    const fieldType = this.getFieldType(fieldModel, debug, modelName, models);
                    if (fieldName === '__string') {
                        const dynamicName = fields[fieldName] as unknown as string;
                        return ` [key: string]: ${dynamicName};`;
                    }
                    return `  ${fieldName}: ${fieldType};`;
                })
                .join('\n');
            const interfaceDefinition = `export interface ${interfaceName}${extendsClause} {\n${fieldDefinitions}\n}\n`;
            return interfaceDefinition;
        });

        return interfaceDefinitions;
    }

    private getFieldType(rawField: string | NangoModel, debug = false, modelName: string, models: NangoModel): string {
        if (typeof rawField === 'string') {
            if (rawField.toString().endsWith(',') || rawField.toString().endsWith(';')) {
                throw new Error(`Field "${rawField}" in the model ${modelName} ends with a comma or semicolon which is not allowed.`);
            }

            let field = rawField;
            let hasNull = false;
            let hasUndefined = false;
            let tsType = '';
            if (field.includes('null')) {
                field = field.replace(/\s*\|\s*null\s*/g, '');
                hasNull = true;
            }

            if (field === 'undefined') {
                if (debug) {
                    printDebug(`Field is defined undefined which isn't recommended.`);
                }
                return 'undefined';
            }

            if (field.includes('undefined')) {
                field = field.replace(/\s*\|\s*undefined\s*/g, '');
                hasUndefined = true;
            }

            switch (field) {
                case 'boolean':
                case 'bool':
                    tsType = 'boolean';
                    break;
                case 'string':
                    tsType = 'string';
                    break;
                case 'char':
                    tsType = 'string';
                    break;
                case 'integer':
                case 'int':
                case 'number':
                    tsType = 'number';
                    break;
                case 'date':
                    tsType = 'Date';
                    break;
                default:
                    tsType = field;
            }

            if (hasNull) {
                tsType = `${tsType} | null`;
            }

            if (hasUndefined) {
                tsType = `${tsType} | undefined`;
            }

            if (tsType.includes('|')) {
                const types = tsType.split('|');
                const hasStringLiteral = types.some((type) => !isJsOrTsType(type.trim()) && !Object.keys(models).includes(type.trim()));

                if (hasStringLiteral) {
                    const enumValues = tsType
                        .split('|')
                        .map((e) => (isJsOrTsType(e.trim()) || Object.keys(models).includes(e.trim()) ? e.trim() : `'${e.trim()}'`))
                        .join(' | ');
                    tsType = enumValues;
                }
            }

            return tsType;
        } else {
            try {
                const nestedFields = Object.keys(rawField)
                    .map((fieldName: string) => `  ${fieldName}: ${this.getFieldType(rawField[fieldName] as string | NangoModel, debug, modelName, models)};`)
                    .join('\n');
                return `{\n${nestedFields}\n}`;
            } catch (_) {
                // eslint-disable-next-line no-console
                console.log(chalk.red(`Failed to parse field ${JSON.stringify(rawField)} so just returning it back as a string`));
                return String(rawField);
            }
        }
    }

    public async createModelFile(notify = false) {
        const configContents = fs.readFileSync(`./${nangoConfigFile}`, 'utf8');
        const configData: NangoConfig = yaml.load(configContents) as NangoConfig;
        const { models, integrations } = configData;
        const interfaceDefinitions = modelService.build(models, integrations);
        if (interfaceDefinitions) {
            fs.writeFileSync(`./${TYPES_FILE_NAME}`, interfaceDefinitions.join('\n'));
        }

        // insert NangoSync types to the bottom of the file
        const typesContent = fs.readFileSync(`${getNangoRootPath()}/${NangoSyncTypesFileLocation}`, 'utf8');
        fs.writeFileSync(`./${TYPES_FILE_NAME}`, typesContent, { flag: 'a' });

        const { success, error, response: config } = await configService.load();

        if (!success || !config) {
            // eslint-disable-next-line no-console
            console.log(chalk.red(error?.message));
            throw new Error('Failed to load config');
        }

        const flowConfig = `export const NangoFlows = ${JSON.stringify(config, null, 2)} as const; \n`;
        fs.writeFileSync(`./${TYPES_FILE_NAME}`, flowConfig, { flag: 'a' });

        if (notify) {
            // eslint-disable-next-line no-console
            console.log(chalk.green(`The ${nangoConfigFile} was updated. The interface file (${TYPES_FILE_NAME}) was updated to reflect the updated config`));
        }
    }
}

const modelService = new ModelService();
export default modelService;
