import type { ReplaceInObject } from '../utils';
import type { DBPlan } from './db.js';
import type { Endpoint } from '../api';

export type ApiPlan = ReplaceInObject<DBPlan, Date, string>;

export type PostPlanExtendTrial = Endpoint<{
    Method: 'POST';
    Path: '/api/v1/plan/trial/extension';
    Querystring: { env: string };
    Success: {
        data: { success: boolean };
    };
}>;
