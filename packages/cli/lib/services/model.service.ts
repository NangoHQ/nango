import chalk from 'chalk';
import type { NangoModel, NangoIntegration, NangoIntegrationData } from '@nangohq/shared';
import { SyncConfigType } from '@nangohq/shared';
import { printDebug } from '../utils.js';

class ModelService {
    public build(models: NangoModel, integrations: NangoIntegration, debug = false): (string | undefined)[] | null {
        const returnedModels = Object.keys(integrations).reduce((acc, providerConfigKey) => {
            const syncObject = integrations[providerConfigKey] as unknown as { [key: string]: NangoIntegration };
            const syncNames = Object.keys(syncObject);
            for (let i = 0; i < syncNames.length; i++) {
                const syncName = syncNames[i] as string;
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
        }, [] as string[]);

        if (!models) {
            return null;
        }

        const interfaceDefinitions = Object.keys(models).map((modelName: string) => {
            const fields = models[modelName] as NangoModel;

            // we only care that models that are returned have an ID field
            // if the model is not returned from a sync script then it must be a
            // helper model that is used to build the returned models
            const syncForModel = Object.keys(integrations).find((providerConfigKey) => {
                const syncObject = integrations[providerConfigKey] as unknown as { [key: string]: NangoIntegration };
                const syncNames = Object.keys(syncObject);
                for (let i = 0; i < syncNames.length; i++) {
                    const syncName = syncNames[i] as string;
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

            const singularModelName = modelName.charAt(modelName.length - 1) === 's' ? modelName.slice(0, -1) : modelName;
            const interfaceName = `${singularModelName.charAt(0).toUpperCase()}${singularModelName.slice(1)}`;
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
                    const fieldType = this.getFieldType(fieldModel, debug);
                    return `  ${fieldName}: ${fieldType};`;
                })
                .join('\n');
            const interfaceDefinition = `export interface ${interfaceName}${extendsClause} {\n${fieldDefinitions}\n}\n`;
            return interfaceDefinition;
        });

        return interfaceDefinitions;
    }

    private getFieldType(rawField: string | NangoModel, debug = false): string {
        if (typeof rawField === 'string') {
            let field = rawField;
            let hasNull = false;
            let hasUndefined = false;
            let tsType = '';
            if (field.indexOf('null') !== -1) {
                field = field.replace(/\s*\|\s*null\s*/g, '');
                hasNull = true;
            }

            if (field === 'undefined') {
                if (debug) {
                    printDebug(`Field is defined undefined which isn't recommended.`);
                }
                return 'undefined';
            }

            if (field.indexOf('undefined') !== -1) {
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
            return tsType;
        } else {
            try {
                const nestedFields = Object.keys(rawField)
                    .map((fieldName: string) => `  ${fieldName}: ${this.getFieldType(rawField[fieldName] as string | NangoModel)};`)
                    .join('\n');
                return `{\n${nestedFields}\n}`;
            } catch (_) {
                console.log(chalk.red(`Failed to parse field ${rawField} so just returning it back as a string`));
                return String(rawField);
            }
        }
    }
}

const modelService = new ModelService();
export default modelService;
