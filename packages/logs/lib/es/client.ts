import { Client } from '@elastic/elasticsearch';
import { envs } from '../env.js';

export const client = new Client({
    // Because it's loaded in CLI and runner we can't required any envs
    nodes: envs.NANGO_LOGS_ES_URL! || 'http://localhost:0',
    requestTimeout: 5000,
    maxRetries: 1,
    auth: { username: envs.NANGO_LOGS_ES_USER!, password: envs.NANGO_LOGS_ES_PWD! },
    tls: { rejectUnauthorized: false }
});
