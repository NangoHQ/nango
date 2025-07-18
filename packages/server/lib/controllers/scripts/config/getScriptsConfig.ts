import { z } from 'zod';

import { getSyncConfigsAsStandardConfig } from '@nangohq/shared';
import { getDefinition } from '@nangohq/utils';

import { providerNameSchema } from '../../../helpers/validation.js';
import { asyncWrapper } from '../../../utils/asyncWrapper.js';

import type { GetPublicScriptsConfig, OpenAIFunction, StandardNangoConfig } from '@nangohq/types';
import type { JSONSchema7 } from 'json-schema';

const OPENAI_FORMAT = 'openai';
const NANGO_FORMAT = 'nango';

type Format = typeof OPENAI_FORMAT | typeof NANGO_FORMAT;

export const validationParams = z
    .object({
        provider: providerNameSchema,
        format: z.enum([NANGO_FORMAT, OPENAI_FORMAT]).default(NANGO_FORMAT)
    })
    .strict();

export const getPublicScriptsConfig = asyncWrapper<GetPublicScriptsConfig>(async (req, res) => {
    const { format = NANGO_FORMAT } = req.query as { format?: Format };
    const { environment } = res.locals;

    const nangoConfigs = await getSyncConfigsAsStandardConfig(environment.id);
    if (!nangoConfigs) {
        res.status(200).send([]);
        return;
    }

    if (format === OPENAI_FORMAT) {
        const openAIFunctions = transformToOpenAIFunctions(nangoConfigs);
        res.status(200).send({ data: openAIFunctions });
        return;
    }

    res.status(200).send(nangoConfigs);
});

/**
 * Transforms Nango script configurations into OpenAI function calling format.
 *
 * How it works:
 * 1. Uses the JSON schema from each script to define parameter types and requirements
 * 2. Extracts parameter descriptions from markdown lists in script descriptions
 * 3. Combines markdown descriptions with JSON schema to create OpenAI function definitions
 *
 * Why this approach:
 * - JSON schema provides a standardized way to define parameter types and requirements
 * - Markdown descriptions in script docs provide human-readable parameter descriptions
 * - This combination gives OpenAI both structured type information and natural language descriptions
 */
export function transformToOpenAIFunctions(configs: StandardNangoConfig[]): OpenAIFunction[] {
    const functions: OpenAIFunction[] = [];

    for (const config of configs) {
        // Process syncs - they don't have parameters
        for (const sync of config.syncs) {
            functions.push({
                name: sync.name,
                description: sync.description || `Execute the ${sync.name} sync for ${config.provider}`,
                parameters: {
                    type: 'object',
                    properties: {},
                    required: []
                }
            });
        }

        // Process actions
        for (const action of config.actions) {
            // Get the input schema from the input model
            let inputSchema = null;
            if (action.input) {
                const definition = getDefinition(action.input, action.json_schema as JSONSchema7);
                if (definition.isOk()) {
                    inputSchema = definition.unwrap();
                }
            }

            // Parse parameter descriptions from the action description
            const parameterDescriptions: Record<string, string> = {};
            if (action.description) {
                const lines = action.description.split('\n');
                for (const line of lines) {
                    const trimmedLine = line.trim();
                    if (trimmedLine.startsWith('-')) {
                        const content = trimmedLine.slice(1).trim();
                        const colonIndex = content.indexOf(':');
                        if (colonIndex !== -1) {
                            const paramName = content.slice(0, colonIndex).trim();
                            const description = content.slice(colonIndex + 1).trim();
                            parameterDescriptions[paramName] = description;
                        }
                    }
                }
            }

            // Combine JSON schema with parameter descriptions
            const properties: Record<string, any> = {};
            if (inputSchema?.properties) {
                Object.assign(properties, inputSchema.properties);
            }
            for (const [paramName, description] of Object.entries(parameterDescriptions)) {
                if (properties[paramName]) {
                    properties[paramName] = {
                        ...properties[paramName],
                        description
                    };
                }
            }

            functions.push({
                name: action.name,
                description: action.description || `Execute the ${action.name} action for ${config.provider}`,
                parameters: {
                    type: 'object',
                    properties,
                    required: inputSchema?.required || []
                }
            });
        }
    }

    return functions;
}
