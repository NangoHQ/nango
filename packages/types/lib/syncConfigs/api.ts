import type { Merge } from 'type-fest';
import type { ApiTimestamps } from '../api';
import type { DBSyncConfig } from './db';

export type ApiSyncConfig = Merge<DBSyncConfig, ApiTimestamps>;
