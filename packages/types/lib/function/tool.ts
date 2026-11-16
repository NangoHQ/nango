import type { FunctionTagValue } from './config.js';

/** Explicit provider scope requirements; omit the declaration when requirements are unknown. */
export type RequiredScopes =
    | { all: [string, ...string[]]; any?: never; none?: never }
    | { any: [string, ...string[]]; all?: never; none?: never }
    | { none: true; all?: never; any?: never };

export interface ToolTags {
    instructions?: string;
    required_scopes?: RequiredScopes;
    [key: string]: FunctionTagValue | RequiredScopes;
}
