import type { Endpoint } from '../api.js';
import type { StandardNangoConfig } from '../flow/index.js';

export interface OpenAIFunction {
    name: string;
    description: string;
    parameters: {
        type: string;
        properties: Record<string, { type: string; description: string }>;
        required: string[];
    };
}

export type GetPublicScriptsConfig = Endpoint<{
    Method: 'GET';
    Path: `/scripts/config`;
    Query: {
        format?: 'nango' | 'openai';
    };
    Success: StandardNangoConfig[] | { data: OpenAIFunction[] };
}>;
