import { Client } from '@elastic/elasticsearch';
import { envs } from '../env.js';
import { isCli } from '../utils.js';

// TODO: remove this
export const client = isCli
    ? (null as unknown as Client)
    : new Client({
          nodes: envs.NANGO_LOGS_ES_URL,
          requestTimeout: 5000,
          maxRetries: 1,
          auth: { username: envs.NANGO_LOGS_ES_USER, password: envs.NANGO_LOGS_ES_PWD },
          tls: { rejectUnauthorized: false }
      });
