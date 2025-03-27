import { z } from 'zod';
import { asyncWrapper } from '../../../utils/asyncWrapper.js';
import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';
import { providerNameSchema } from '../../../helpers/validation.js';
import type { StandardNangoConfig, NangoModelField } from '@nangohq/types';
import { getSyncConfigsAsStandardConfig } from '@nangohq/shared';

export const validationParams = z
    .object({
        provider: providerNameSchema
    })
    .strict();

interface OpenAIFunction {
    name: string;
    description: string;
    parameters: {
        type: string;
        properties: Record<string, any>;
        required: string[];
    };
}

interface LegacyModelField {
    name: string;
    type: string;
    description?: string;
    optional?: boolean;
}

function isLegacyModelField(field: NangoModelField | LegacyModelField): field is LegacyModelField {
    return 'type' in field;
}

function getFieldType(field: NangoModelField | LegacyModelField): string {
    if (isLegacyModelField(field)) {
        return field.type;
    }

    // Handle array fields
    if ('array' in field && field.array) {
        return 'array';
    }

    if (typeof field.value === 'string') {
        return field.value;
    }
    if (typeof field.value === 'number') {
        return 'number';
    }
    if (typeof field.value === 'boolean') {
        return 'boolean';
    }
    if (field.value === null) {
        return 'null';
    }
    if (Array.isArray(field.value)) {
        return 'array';
    }
    return 'string'; // Default to string if unknown
}

function getFieldDescription(field: NangoModelField | LegacyModelField): string {
    if (isLegacyModelField(field)) {
        return field.description || '';
    }

    // Try to parse description from the field value if it's a string
    if (typeof field.value === 'string') {
        // Look for a description in the string value
        const descriptionMatch = field.value.match(/\/\*\*(.*?)\*\//);
        if (descriptionMatch && descriptionMatch[1]) {
            return descriptionMatch[1].trim();
        }
    }

    return '';
}

function isFieldOptional(field: NangoModelField | LegacyModelField): boolean {
    if (isLegacyModelField(field)) {
        return field.optional || false;
    }
    return field.optional || false;
}

function parseParameterDescriptions(description: string): Record<string, string> {
    const descriptions: Record<string, string> = {};
    const lines = description.split('\n');

    for (const line of lines) {
        // Match markdown list items that describe parameters
        const match = line.match(/^-\s*(\w+):\s*(.+)$/);
        if (match && match[1] && match[2]) {
            const [, paramName, paramDesc] = match;
            descriptions[paramName] = paramDesc.trim();
        }
    }

    return descriptions;
}

function transformToOpenAIFunctions(configs: StandardNangoConfig[]): OpenAIFunction[] {
    const functions: OpenAIFunction[] = [];

    for (const config of configs) {
        // Transform syncs
        for (const sync of config.syncs) {
            const functionName = `${config.provider}.${sync.name}`;
            const properties: Record<string, any> = {};
            const required: string[] = [];
            const paramDescriptions = parseParameterDescriptions(sync.description || '');

            // Add input parameters if they exist
            if (sync.input) {
                for (const field of sync.input.fields) {
                    const fieldType = getFieldType(field);
                    const fieldDescription = paramDescriptions[field.name] || getFieldDescription(field);

                    properties[field.name] = {
                        type: fieldType,
                        description: fieldDescription
                    };

                    // Handle array fields
                    if ('array' in field && field.array) {
                        properties[field.name].items = {
                            type: typeof field.value === 'string' ? field.value : 'string'
                        };
                    }

                    if (!isFieldOptional(field)) {
                        required.push(field.name);
                    }
                }
            }

            functions.push({
                name: functionName,
                description: sync.description || `Execute the ${sync.name} sync for ${config.provider}`,
                parameters: {
                    type: 'object',
                    properties,
                    required
                }
            });
        }

        // Transform actions
        for (const action of config.actions) {
            const functionName = `${config.provider}.${action.name}`;
            const properties: Record<string, any> = {};
            const required: string[] = [];
            const paramDescriptions = parseParameterDescriptions(action.description || '');

            // Add input parameters if they exist
            if (action.input) {
                for (const field of action.input.fields) {
                    const fieldType = getFieldType(field);
                    const fieldDescription = paramDescriptions[field.name] || getFieldDescription(field);

                    properties[field.name] = {
                        type: fieldType,
                        description: fieldDescription
                    };

                    // Handle array fields
                    if ('array' in field && field.array) {
                        properties[field.name].items = {
                            type: typeof field.value === 'string' ? field.value : 'string'
                        };
                    }

                    if (!isFieldOptional(field)) {
                        required.push(field.name);
                    }
                }
            }

            functions.push({
                name: functionName,
                description: action.description || `Execute the ${action.name} action for ${config.provider}`,
                parameters: {
                    type: 'object',
                    properties,
                    required
                }
            });
        }
    }

    return functions;
}

export const getPublicScriptsConfigOpenAI = asyncWrapper(async (req, res) => {
    const queryValue = requireEmptyQuery(req);
    if (queryValue) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(queryValue.error) } });
        return;
    }

    const { environment } = res.locals;

    const nangoConfigs = await getSyncConfigsAsStandardConfig(environment.id);
    if (!nangoConfigs) {
        res.status(200).send([]);
        return;
    }

    const openAIFunctions = transformToOpenAIFunctions(nangoConfigs);
    res.status(200).send(openAIFunctions);
});
