import type { Endpoint } from '../api';
import type { StandardNangoConfig } from '../flow';

export interface OpenAIFunction {
    name: string;
    description: string;
    parameters: {
        type: string;
        properties: Record<string, any>;
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
