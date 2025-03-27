import type { Endpoint } from '../api';
import type { StandardNangoConfig } from '../flow';

export type GetPublicScriptsConfig = Endpoint<{
    Method: 'GET';
    Path: `/scripts/config`;
    Success: StandardNangoConfig[];
}>;

export interface OpenAIFunction {
    name: string;
    description: string;
    parameters: {
        type: string;
        properties: Record<string, any>;
        required: string[];
    };
}

export type GetPublicScriptsConfigOpenAI = Endpoint<{
    Method: 'GET';
    Path: `/scripts/config/openai`;
    Success: OpenAIFunction[];
}>;
