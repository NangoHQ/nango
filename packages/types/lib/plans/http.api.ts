import type { BillingCustomer, BillingUsageMetric } from '../billing/types.js';
import type { MetricUsageSummary } from '../usage/dto.js';
import type { ReplaceInObject } from '../utils.js';
import type { DBPlan } from './db.js';
import type { Endpoint } from '../api.js';

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
    /**
     * Maps to orb external plan id
     */
    name: DBPlan['name'];
    title: string;
    description: string;
    canChange: boolean;
    nextPlan: string[] | null;
    prevPlan: string[] | null;
    basePrice?: number;

    cta?: string;
    hidden?: boolean;
    flags: Omit<Partial<DBPlan>, 'id' | 'account_id' | 'name'>;
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
        data: Record<string, MetricUsageSummary>; //TODO: clean type
    };
}>;

export type GetBillingUsage = Endpoint<{
    Method: 'GET';
    Path: '/api/v1/plans/billing-usage';
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
    Body: { orbId: string };
    Success: {
        data: { success: true } | { paymentIntent: any };
    };
}>;
