import type { ApiTimestamps } from '../api.js';
import type { DBSyncConfig } from './db.js';
import type { Merge } from 'type-fest';

export type ApiSyncConfig = Merge<DBSyncConfig, ApiTimestamps>;
