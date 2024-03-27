const PORT = process.env['SERVER_PORT'] || 3003;

export const localhostUrl = `http://localhost:${PORT}`;
export const cloudHost = 'https://api.nango.dev';
export const stagingHost = 'https://api-staging.nango.dev';

export enum NodeEnv {
    Dev = 'development',
    Staging = 'staging',
    Prod = 'production'
}
