export const localhostUrl: string = 'http://localhost:3003';
export const stagingUrl: string = 'https://api-staging.nango.dev';
export const prodUrl: string = 'https://api.nango.dev';

export function isHosted() {
    return process.env.REACT_APP_ENV === 'hosted';
}

export function isStaging() {
    return process.env.REACT_APP_ENV === 'staging';
}

export function isProd() {
    return process.env.REACT_APP_ENV === 'production';
}

export function isCloud() {
    return isProd() || isStaging();
}

export function baseUrl() {
    switch (process.env.REACT_APP_ENV) {
        case 'hosted':
            return localhostUrl;
        case 'staging':
            return stagingUrl;
        case 'production':
            return prodUrl;
        default:
            return localhostUrl;
    }
}

export function defaultCallback() {
    return baseUrl() + '/oauth/callback';
}
