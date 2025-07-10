import { Client } from '@elastic/elasticsearch';

import { envs } from '../env.js';

export const client = new Client({
    nodes: envs.NANGO_LOGS_ES_URL || 'http://localhost:0',
    requestTimeout: 5000,
    maxRetries: 1,
    auth: {
        username: envs.NANGO_LOGS_ES_USER!, // ggignore
        password: envs.NANGO_LOGS_ES_PWD! // ggignore
    }
});
