export interface GlobalOptions {
    autoConfirm: boolean;
    debug: boolean;
}

export type ENV = 'local' | 'staging' | 'production';

export interface DeployOptions extends GlobalOptions {
    env?: ENV;
    local?: boolean;
    staging?: boolean;
    version?: string;
    sync?: string;
    action?: string;
    allowDestructive?: boolean;
}

export interface InternalDeployOptions {
    env?: ENV;
}
