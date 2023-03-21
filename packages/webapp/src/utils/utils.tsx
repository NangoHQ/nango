export const localhostUrl: string = 'http://localhost:3003';
export const stagingUrl: string = 'https://api.nango.dev';
export const prodUrl: string = 'https://api-staging.nango.dev';

export enum NodeEnv {
    Hosted = 'hosted',
    Staging = 'staging',
    Prod = 'production'
}

export enum EnvKeys {
    Env = 'REACT_APP_ENV'
}

export function isHosted() {
    return process.env[EnvKeys.Env] === NodeEnv.Hosted;
}

export function isStaging() {
    return process.env[EnvKeys.Env] === NodeEnv.Staging;
}

export function isProd() {
    return process.env[EnvKeys.Env] === NodeEnv.Prod;
}

export function isCloud() {
    return isProd() || isStaging();
}

export function baseUrl() {
    switch (process.env[EnvKeys.Env]) {
        case NodeEnv.Hosted:
            return localhostUrl;
        case NodeEnv.Staging:
            return stagingUrl;
        case NodeEnv.Prod:
            return prodUrl;
        default:
            return localhostUrl;
    }
}

export function defaultCallback() {
    return baseUrl() + '/oauth/callback';
}
