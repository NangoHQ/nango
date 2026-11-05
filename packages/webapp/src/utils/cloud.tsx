import { globalEnv } from './env';

export function isCloudProd() {
    return window.location.origin === 'https://app.nango.dev';
}

export function defaultCallback() {
    return globalEnv.apiUrl + '/oauth/callback';
}
