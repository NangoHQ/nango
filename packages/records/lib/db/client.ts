import knex from 'knex';
import { config } from './config.js';

export const db = knex(config);
