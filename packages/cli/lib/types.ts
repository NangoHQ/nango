export interface GlobalOptions {
    autoConfirm: boolean;
    debug: boolean;
    interactive: boolean;
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
