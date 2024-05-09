import { Client } from '@opensearch-project/opensearch';
import { envs } from '../env.js';

export const client = new Client({
    nodes: envs.NANGO_LOGS_OS_URL || 'http://localhost:0',
    requestTimeout: 5000,
    maxRetries: 1,
    auth: {
        username: envs.NANGO_LOGS_OS_USER!, // ggignore
        password: envs.NANGO_LOGS_OS_PWD! // ggignore
    },
    ssl: { rejectUnauthorized: false }
});
