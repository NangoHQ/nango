import type { ReplaceInObject } from '../utils';
import type { DBPlan } from './db';

export type ApiPlan = ReplaceInObject<DBPlan, Date, string>;
