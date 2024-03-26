import { NodeEnv, localhostUrl } from './constants.js';

export const AUTH_ENABLED = isCloud() || isEnterprise();
export const MANAGED_AUTH_ENABLED = isCloud() || isLocal();

export function getEnv() {
    if (isStaging()) {
        return NodeEnv.Staging;
    } else if (isProd()) {
        return NodeEnv.Prod;
    } else {
        return NodeEnv.Dev;
    }
}

export function isStaging() {
    return process.env['NODE_ENV'] === NodeEnv.Staging;
}

export function isProd() {
    return process.env['NODE_ENV'] === NodeEnv.Prod;
}

export function isHosted() {
    return !isCloud() && !isLocal() && !isEnterprise();
}

export function isCloud() {
    return process.env['NANGO_CLOUD']?.toLowerCase() === 'true';
}

export function isLocal() {
    return getBaseUrl() === localhostUrl;
}

export function isEnterprise() {
    return process.env['NANGO_ENTERPRISE']?.toLowerCase() === 'true';
}

export function isDev() {
    return process.env['NODE_ENV'] === NodeEnv.Dev;
}

export function isTest(): boolean {
    return Boolean(process.env['CI'] !== undefined || process.env['VITEST']);
}

export function isBasicAuthEnabled() {
    return !isCloud() && process.env['NANGO_DASHBOARD_USERNAME'] && process.env['NANGO_DASHBOARD_PASSWORD'];
}

export function getBaseUrl() {
    return process.env['NANGO_SERVER_URL'] || localhostUrl;
}

export function getBasePublicUrl() {
    if (process.env['NANGO_SERVER_URL']) {
        return process.env['NANGO_SERVER_URL'].replace('api.', 'app.');
    } else {
        return getBaseUrl();
    }
}
