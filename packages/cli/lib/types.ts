export const SOURCEMAP_OPTIONS = ['inline', 'false'] as const;
export type SourcemapOption = (typeof SOURCEMAP_OPTIONS)[number];

export interface GlobalOptions {
    autoConfirm: boolean;
    debug: boolean;
    interactive: boolean;
    dependencyUpdate: boolean;
    telemetry?: boolean;
    sourcemap?: SourcemapOption;
}

export type ENV = 'local' | 'cloud';

export interface DeployOptions extends GlobalOptions {
    env?: ENV;
    local?: boolean;
    version?: string;
    sync?: string;
    action?: string;
    allowDestructive?: boolean;
    integration?: string;
}

export interface InternalDeployOptions {
    env?: ENV;
    integration?: string;
}

export const FUNCTION_TYPES = ['sync', 'action', 'on-event'] as const;

export type FunctionType = (typeof FUNCTION_TYPES)[number];
