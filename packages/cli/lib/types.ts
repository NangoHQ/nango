export interface GlobalOptions {
    autoConfirm: boolean;
    debug: boolean;
}

export type ENV = 'local' | 'cloud';

export interface DeployOptions extends GlobalOptions {
    env?: ENV;
    local?: boolean;
    version?: string;
    sync?: string;
    action?: string;
    allowDestructive?: boolean;
    integrationId?: string;
}

export interface InternalDeployOptions {
    env?: ENV;
    integrationId?: string;
}
