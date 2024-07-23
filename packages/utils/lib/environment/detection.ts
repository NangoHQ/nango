import { NodeEnv, localhostUrl } from './constants.js';

export const baseUrl = process.env['NANGO_SERVER_URL'] || localhostUrl;
export const basePublicUrl = process.env['NANGO_PUBLIC_SERVER_URL'] || baseUrl;

export const isDocker = process.env['SERVER_RUN_MODE'] === 'DOCKERIZED';
export const isStaging = process.env['NODE_ENV'] === NodeEnv.Staging;
export const isProd = process.env['NODE_ENV'] === NodeEnv.Prod;
export const isCloud = process.env['NANGO_CLOUD']?.toLowerCase() === 'true';
export const isEnterprise = process.env['NANGO_ENTERPRISE']?.toLowerCase() === 'true';
export const isLocal = !isCloud && !isEnterprise && !isDocker && (process.env['NODE_ENV'] === NodeEnv.Dev || !process.env['NODE_ENV']);
export const isTest = Boolean(process.env['CI'] !== undefined || process.env['VITEST']);
export const isBasicAuthEnabled = !isCloud && process.env['NANGO_DASHBOARD_USERNAME'] && process.env['NANGO_DASHBOARD_PASSWORD'];
export const isHosted = !isCloud && !isLocal && !isEnterprise;

export const env = isStaging ? NodeEnv.Staging : isProd ? NodeEnv.Prod : NodeEnv.Dev;

export const useS3 = Boolean(process.env['AWS_REGION'] && process.env['AWS_BUCKET_NAME']);
export const integrationFilesAreRemote = isEnterprise && useS3;

export const flagHasScripts = isLocal || isEnterprise || isCloud || isTest;
export const flagHasAuth = isCloud || isEnterprise || isTest || process.env['FLAG_AUTH_ENABLED'] === 'true';
export const flagHasManagedAuth =
    (isCloud || isLocal || process.env['FLAG_MANAGED_AUTH_ENABLED'] === 'true') && process.env['WORKOS_API_KEY'] && process.env['WORKOS_CLIENT_ID'];
