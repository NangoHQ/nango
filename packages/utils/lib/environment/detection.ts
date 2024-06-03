import { localhostUrl } from './constants.js';

export const baseUrl = process.env['NANGO_SERVER_URL'] || localhostUrl;
export const basePublicUrl = process.env['NANGO_PUBLIC_SERVER_URL'] || baseUrl;
export const serverSubdirectory = new URL(baseUrl).pathname;
export const webSubdirectory = new URL(basePublicUrl).pathname;

export const isDocker = process.env['SERVER_RUN_MODE'] === 'DOCKERIZED';
export const isProd = process.env['NODE_ENV'] === 'production';
export const isCloud = process.env['NANGO_CLOUD']?.toLowerCase() === 'true';
export const isEnterprise = process.env['NANGO_ENTERPRISE']?.toLowerCase() === 'true';
export const isLocal = !isCloud && !isEnterprise && !isDocker && (process.env['NODE_ENV'] === 'development' || !process.env['NODE_ENV']);
export const isTest = Boolean(process.env['CI'] !== undefined || process.env['VITEST']);
export const isBasicAuthEnabled = !isCloud && process.env['NANGO_DASHBOARD_USERNAME'] && process.env['NANGO_DASHBOARD_PASSWORD'];
export const isHosted = !isCloud && !isLocal && !isEnterprise;

export const AUTH_ENABLED = isCloud || isEnterprise;
export const MANAGED_AUTH_ENABLED = isCloud || isLocal;

export const useS3 = Boolean(process.env['AWS_REGION'] && process.env['AWS_BUCKET_NAME']);
export const integrationFilesAreRemote = isEnterprise && useS3;

// TODO: replace this with an env var
export const env = isLocal ? 'development' : baseUrl.includes('staging') ? 'staging' : 'prod';
