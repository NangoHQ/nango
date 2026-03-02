import { globalEnv } from './env';

export const githubRepo = 'https://github.com/NangoHQ/integration-templates';
export const githubIntegrationTemplates = `${githubRepo}/tree/main/integrations`;

export function isCloudProd() {
    return window.location.origin === 'https://app.nango.dev';
}

export function defaultCallback() {
    return globalEnv.apiUrl + '/oauth/callback';
}
