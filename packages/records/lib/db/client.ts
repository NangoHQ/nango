import knex from 'knex';

import { config, configRead } from './config.js';

export const db = knex(config);
export const dbRead = configRead ? knex(configRead) : db;
