import type { ReplaceInObject } from '../utils';
import type { DBPlan } from './db.js';
import type { Endpoint } from '../api';

export type ApiPlan = ReplaceInObject<DBPlan, Date, string>;

export type PostPlanExtendTrial = Endpoint<{
    Method: 'POST';
    Path: '/api/v1/plans/trial/extension';
    Querystring: { env: string };
    Success: {
        data: { success: boolean };
    };
}>;

export interface PlanDefinition {
    code: string;
    title: string;
    description: string;
    canUpgrade: boolean;
    canDowngrade: false;
    cta?: string;
    hidden?: boolean;
    // We use the lookup id instead of price_id, so it's unique across prod and staging env
    stripLookupKey?: string;
    flags: Omit<Partial<DBPlan>, 'id' | 'account_id'>;
}
