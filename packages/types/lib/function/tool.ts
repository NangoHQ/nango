import type { FunctionTags } from './config.js';

export type ToolTags = {
    required_scopes?: string[];
    instructions?: string;
} & FunctionTags;
