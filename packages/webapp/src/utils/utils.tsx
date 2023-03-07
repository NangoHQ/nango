export enum NodeEnv {
    Hosted = 'hosted',
    Cloud = 'cloud'
}

export enum EnvKeys {
    Env = 'REACT_APP_ENV'
}

export function isHosted() {
    return process.env[EnvKeys.Env] === NodeEnv.Hosted;
}

export function isCloud() {
    return process.env[EnvKeys.Env] === NodeEnv.Cloud;
}
