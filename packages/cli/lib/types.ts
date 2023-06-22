export interface GlobalOptions {
    secretKey?: string;
    host?: string;
}

export interface DeployOptions extends GlobalOptions {
    staging: boolean;
    version?: string;
    sync?: string;
}
