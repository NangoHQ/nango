export interface GlobalOptions {
    autoConfirm: boolean;
    debug: boolean;
}

export type ENV = 'local' | 'staging' | 'production';

export interface DeployOptions extends GlobalOptions {
    env?: 'local' | 'staging' | 'production';
    local?: boolean;
    staging?: boolean;
    version?: string;
    sync?: string;
    action?: string;
}
