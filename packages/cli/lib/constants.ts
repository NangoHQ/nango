export const TYPES_FILE_NAME = 'models.ts';
export const NANGO_INTEGRATIONS_NAME = 'nango-integrations';
export const exampleSyncName = 'github-issue-example';

export const port = process.env['NANGO_PORT'] || process.env['SERVER_PORT'] || '3003';
export const localhostUrl = `http://localhost:${port}`;
export const cloudHost = 'https://api.nango.dev';
