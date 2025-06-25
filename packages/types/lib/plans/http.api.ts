import type { BillingCustomer, BillingUsageMetric } from '../billing/types';
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
    canDowngrade: boolean;
    basePrice?: number;
    /**
     * OrbId is the custom external_plan_id that we can setup
     * It's handy because you can set the same id in staging and prod
     */
    orbId?: string;
    cta?: string;
    hidden?: boolean;
    flags: Omit<Partial<DBPlan>, 'id' | 'account_id'>;
    display?: {
        featuresHeading?: string;
        features: { title: string; sub?: string }[];
        sub?: string;
    };
}

export type GetPlans = Endpoint<{
    Method: 'GET';
    Path: '/api/v1/plans';
    Querystring: { env: string };
    Success: {
        data: PlanDefinition[];
    };
}>;

export type GetPlan = Endpoint<{
    Method: 'GET';
    Path: '/api/v1/plans/current';
    Querystring: { env: string };
    Success: {
        data: ApiPlan;
    };
}>;

export type GetUsage = Endpoint<{
    Method: 'GET';
    Path: '/api/v1/plans/usage';
    Querystring: { env: string };
    Success: {
        data: {
            customer: BillingCustomer;
            current: BillingUsageMetric[];
            previous: BillingUsageMetric[];
        };
    };
}>;

export type PostPlanChange = Endpoint<{
    Method: 'POST';
    Path: '/api/v1/plans/change';
    Querystring: { env: string };
    Body: { orbId: string; isUpgrade: boolean };
    Success: {
        data: { success: true } | { paymentIntent: any };
    };
}>;
