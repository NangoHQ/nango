import { keepPreviousData, queryOptions, useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';

import { permissions } from '@nangohq/authz';

import { applyPlanOverride, buildOverdueOverride, buildPeriodCostsOverride, buildSpendOverride, usePlanOverrideStore } from '../features/planOverride';
import { APIError, apiFetch } from '../utils/api';
import { globalEnv } from '../utils/env';
import { useEnvironment } from './useEnvironment';
import { usePermissions } from './usePermissions';

import type {
    ApiPlan,
    BreakdownDimensions,
    DeleteSpendAlert,
    GetBillingPeriodCosts,
    GetBillingUsage,
    GetBillingUsageTopDimensionValues,
    GetEnvironment,
    GetOverdueInvoices,
    GetPlan,
    GetPlans,
    GetSpendAlert,
    GetUpcomingInvoice,
    GetUsage,
    PostPlanChange,
    PostPlanExtendTrial,
    PutBillingInvoicingDetails,
    PutSpendAlert,
    UsageMetric
} from '@nangohq/types';
import type { InfiniteData, QueryKey } from '@tanstack/react-query';

export async function fetchCurrentPlan(env: string): Promise<GetPlan['Success']> {
    const res = await apiFetch(`/api/v1/plans/current?env=${env}`, { method: 'GET' });
    const json = (await res.json()) as GetPlan['Reply'];
    if (res.status !== 200 || 'error' in json) {
        throw new APIError({ res, json });
    }
    return json;
}

export function currentPlanQueryOptions(env: string) {
    return queryOptions<GetPlan['Success'], APIError>({
        enabled: Boolean(env) && globalEnv.features.plan,
        queryKey: ['plans', 'current', env],
        queryFn: () => fetchCurrentPlan(env)
    });
}

/** Applies the dev-tool plan override (planOverride.ts) to a real plan, for visual QA. */
function usePlanOverride(env: string, realPlan: ApiPlan | null | undefined): ApiPlan | null | undefined {
    const overrideCode = usePlanOverrideStore((s) => s.overrideCode);
    const scheduledTargetCode = usePlanOverrideStore((s) => s.scheduledTargetCode);
    // Only fetch when an override is set, to avoid an extra /plans request on every load.
    const { data: plansList } = useApiGetPlans(env, { enabled: Boolean(overrideCode) });

    return useMemo(() => {
        if (!overrideCode) {
            return realPlan;
        }
        const overridePlan = plansList?.data.find((p) => p.code === overrideCode) ?? null;
        const scheduledTarget = plansList?.data.find((p) => p.code === scheduledTargetCode) ?? null;
        return applyPlanOverride(realPlan, { overridePlan, scheduledTarget });
    }, [realPlan, overrideCode, scheduledTargetCode, plansList]);
}

export function useApiGetCurrentPlan(env: string) {
    const query = useQuery(currentPlanQueryOptions(env));
    const plan = usePlanOverride(env, query.data?.data);

    return useMemo(() => ({ ...query, data: query.data && plan ? { data: plan } : query.data }), [query, plan]);
}

/** `useEnvironment` with the dev-tool plan override applied to `data.plan`. */
export function useCurrentPlan(env: string) {
    const query = useEnvironment(env);
    const plan = usePlanOverride(env, query.data?.plan);

    return useMemo<typeof query>(
        () => (query.data ? { ...query, data: { ...(query.data as GetEnvironment['Success']), plan: plan ?? null } } : query),
        [query, plan]
    );
}

export function planHasRbac(plan?: ApiPlan | null): boolean {
    if (!globalEnv.features.plan || !plan) {
        return true;
    }
    return plan.has_rbac;
}

export async function apiPostPlanExtendTrial(env: string) {
    const res = await apiFetch(`/api/v1/plans/trial/extension?env=${env}`, {
        method: 'POST'
    });

    return {
        res,
        json: (await res.json()) as PostPlanExtendTrial['Reply']
    };
}

export function useApiGetPlans(env: string, options?: { enabled?: boolean }) {
    return useQuery<GetPlans['Success'], APIError>({
        enabled: Boolean(env) && (options?.enabled ?? true),
        queryKey: ['plans'],
        queryFn: async (): Promise<GetPlans['Success']> => {
            const res = await apiFetch(`/api/v1/plans?env=${env}`, {
                method: 'GET'
            });

            const json = (await res.json()) as GetPlans['Reply'];
            if (res.status !== 200 || 'error' in json) {
                throw new APIError({ res, json });
            }

            return json;
        }
    });
}

export const GetUsageQueryKey = ['plans', 'usage'];

export function useApiGetUsage(env: string) {
    return useQuery<GetUsage['Success'], APIError>({
        enabled: Boolean(env),
        queryKey: [...GetUsageQueryKey, env],
        queryFn: async (): Promise<GetUsage['Success']> => {
            const res = await apiFetch(`/api/v1/plans/usage?env=${env}`, {
                method: 'GET'
            });

            const json = (await res.json()) as GetUsage['Reply'];
            if (res.status !== 200 || 'error' in json) {
                throw new APIError({ res, json });
            }

            return json;
        },
        refetchInterval: 1000 * 10 // 10 seconds
    });
}

export const GetOverdueInvoicesQueryKey = ['plans', 'billing', 'overdue'];

// Short enough that the alert clears soon after an invoice is paid.
const OVERDUE_INVOICES_STALE_TIME = 10 * 60 * 1000; // 10min
const OVERDUE_INVOICES_POLL_INTERVAL = 60 * 1000; // 1min

/** Whether the org has overdue invoices, plus the Orb portal URL for the CTA. */
export function useApiGetOverdueInvoices(env: string, plan?: { name: string } | null, realPortalUrl?: string | null) {
    const planName = plan?.name;
    const overdueOverride = usePlanOverrideStore((s) => s.overdueOverride);
    // Only used to key the cache: `portalUrl` is returned to billing managers only, so a mid-session
    // permission change must not serve the other role's cached response.
    const { can } = usePermissions();
    const canManageBilling = can(permissions.canManageBilling);
    return useQuery<GetOverdueInvoices['Success'], APIError>({
        // Fetched for every member, not just billing managers — the overdue warning shows to all. Not
        // gated on the plan either: a downgraded account can still owe an invoice.
        enabled: Boolean(env),
        staleTime: OVERDUE_INVOICES_STALE_TIME,
        // Only while something is overdue: Orb retries a failed charge asynchronously, and nothing else
        // refetches this (window-focus refetching is off), so the alert would otherwise outlive payment.
        refetchInterval: (query) => (query.state.data?.data.hasOverdue ? OVERDUE_INVOICES_POLL_INTERVAL : false),
        queryKey: [...GetOverdueInvoicesQueryKey, env, planName, canManageBilling, overdueOverride, overdueOverride ? realPortalUrl : null],
        queryFn: async (): Promise<GetOverdueInvoices['Success']> => {
            if (overdueOverride) {
                return buildOverdueOverride(realPortalUrl);
            }

            const res = await apiFetch(`/api/v1/plans/billing/overdue?env=${env}`, {
                method: 'GET'
            });

            const json = (await res.json()) as GetOverdueInvoices['Reply'];
            if (res.status !== 200 || 'error' in json) {
                throw new APIError({ res, json });
            }

            return json;
        }
    });
}

export const GetUpcomingInvoiceQueryKey = ['plans', 'billing', 'upcoming-invoice'];

function currentBillingPeriod(): string {
    return new Date().toISOString().slice(0, 7);
}

const UPCOMING_INVOICE_STALE_TIME = 60 * 60 * 1000; // 1h

/**
 * The current period's accrued spend, backing the summary strip headline. `enabled` is the
 * caller's call — the rollout flag and the plan both have to agree before we ask.
 */
export function useApiGetUpcomingInvoice(env: string, plan?: { name: string } | null, options?: { enabled?: boolean }) {
    const planName = plan?.name;
    // Dev-tool override — the noop billing client returns no invoice, so this is the only way to
    // see the populated states outside a real paid account.
    const spendOverride = usePlanOverrideStore((s) => s.spendOverride);
    return useQuery<GetUpcomingInvoice['Success'], APIError>({
        enabled: Boolean(env) && (options?.enabled ?? false),
        staleTime: UPCOMING_INVOICE_STALE_TIME,
        // Everything that changes the answer is in the key, including the UTC month: nearly every
        // subscription bills on the calendar month, so this rotates when their period does.
        queryKey: [...GetUpcomingInvoiceQueryKey, env, planName, currentBillingPeriod(), spendOverride],
        queryFn: async (): Promise<GetUpcomingInvoice['Success']> => {
            if (spendOverride !== null) {
                return buildSpendOverride(spendOverride);
            }

            const res = await apiFetch(`/api/v1/plans/billing/upcoming-invoice?env=${env}`, {
                method: 'GET'
            });

            const json = (await res.json()) as GetUpcomingInvoice['Reply'];
            if (res.status !== 200 || 'error' in json) {
                throw new APIError({ res, json });
            }

            return json;
        }
    });
}

export const GetBillingPeriodCostsQueryKey = ['plans', 'billing', 'period-costs'];

/**
 * Shares the invoice's stale time deliberately: both read the same Orb figures, and different
 * windows would let two views of them disagree.
 */
export function useApiGetBillingPeriodCosts(env: string, plan?: { name: string } | null, options?: { enabled?: boolean }) {
    const planName = plan?.name;
    const periodCostsOverride = usePlanOverrideStore((s) => s.periodCostsOverride);
    return useQuery<GetBillingPeriodCosts['Success'], APIError>({
        enabled: Boolean(env) && (options?.enabled ?? false),
        staleTime: UPCOMING_INVOICE_STALE_TIME,
        queryKey: [...GetBillingPeriodCostsQueryKey, env, planName, currentBillingPeriod(), periodCostsOverride],
        queryFn: async (): Promise<GetBillingPeriodCosts['Success']> => {
            if (periodCostsOverride !== null) {
                return buildPeriodCostsOverride(periodCostsOverride);
            }

            const res = await apiFetch(`/api/v1/plans/billing/period-costs?env=${env}`, {
                method: 'GET'
            });

            const json = (await res.json()) as GetBillingPeriodCosts['Reply'];
            if (res.status !== 200 || 'error' in json) {
                throw new APIError({ res, json });
            }

            return json;
        }
    });
}

export const GetSpendAlertQueryKey = ['plans', 'billing', 'spend-alert'];

/** Only changes when someone on the account changes it, so the default stale time is enough. */
export function useApiGetSpendAlert(env: string, plan?: { name: string } | null, options?: { enabled?: boolean }) {
    const planName = plan?.name;
    return useQuery<GetSpendAlert['Success'], APIError>({
        enabled: Boolean(env) && (options?.enabled ?? true),
        // planName is in the key for the same reason as the upcoming invoice: switching plan
        // in-session shouldn't briefly show the previous plan's answer.
        queryKey: [...GetSpendAlertQueryKey, env, planName],
        queryFn: async (): Promise<GetSpendAlert['Success']> => {
            const res = await apiFetch(`/api/v1/plans/billing/spend-alert?env=${env}`, {
                method: 'GET'
            });

            const json = (await res.json()) as GetSpendAlert['Reply'];
            if (res.status !== 200 || 'error' in json) {
                throw new APIError({ res, json });
            }

            return json;
        }
    });
}

export function usePutSpendAlert(env: string) {
    const queryClient = useQueryClient();
    return useMutation<PutSpendAlert['Success'], APIError, PutSpendAlert['Body']>({
        mutationFn: async (body): Promise<PutSpendAlert['Success']> => {
            const res = await apiFetch(`/api/v1/plans/billing/spend-alert?env=${env}`, {
                method: 'PUT',
                body: JSON.stringify(body)
            });

            const json = (await res.json()) as PutSpendAlert['Reply'];
            if (res.status !== 200 || 'error' in json) {
                throw new APIError({ res, json });
            }

            return json;
        },
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: GetSpendAlertQueryKey });
        }
    });
}

export function useDeleteSpendAlert(env: string) {
    const queryClient = useQueryClient();
    return useMutation<DeleteSpendAlert['Success'], APIError, void>({
        mutationFn: async (): Promise<DeleteSpendAlert['Success']> => {
            const res = await apiFetch(`/api/v1/plans/billing/spend-alert?env=${env}`, {
                method: 'DELETE'
            });

            const json = (await res.json()) as DeleteSpendAlert['Reply'];
            if (res.status !== 200 || 'error' in json) {
                throw new APIError({ res, json });
            }

            return json;
        },
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: GetSpendAlertQueryKey });
        }
    });
}

export const GetBillingUsageQueryKey = ['plans', 'billing-usage'];

export function useApiGetBillingUsage(env: string, timeframe?: { start: string; end: string }, options?: { avgPerDay?: boolean; enabled?: boolean }) {
    return useQuery<GetBillingUsage['Success'], APIError>({
        enabled: Boolean(env) && (options?.enabled ?? true),
        // `env` keeps environments separate; `avgPerDay ?? false` so an omitted arg and an explicit false share one cache entry.
        queryKey: [...GetBillingUsageQueryKey, env, timeframe, options?.avgPerDay ?? false],
        queryFn: async (): Promise<GetBillingUsage['Success']> => {
            const params = new URLSearchParams({ env });
            if (timeframe) {
                params.append('from', timeframe.start);
                params.append('to', timeframe.end);
            }
            if (options?.avgPerDay) {
                params.append('avgPerDay', 'true');
            }

            const res = await apiFetch(`/api/v1/plans/billing-usage?${params.toString()}`, {
                method: 'GET'
            });

            const json = (await res.json()) as GetBillingUsage['Reply'];
            if (res.status !== 200 || 'error' in json) {
                throw new APIError({ res, json });
            }

            return json;
        }
    });
}

/**
 * Per-panel usage detail. Fires one request scoped to a single metric
 * (`metrics=<metric>`) carrying an optional `breakdown[<metric>]=<dimension>`
 * and/or `filter[<metric>]=<dim>:<value>` spec, covering every drill-in state:
 *
 *  - breakdown only → top-N dimension-value series + 'rest' rollup under
 *    `usage[metric].breakdown` (top-level `usage` empty).
 *  - filter only → the metric scoped to one value, single series in the
 *    top-level `usage[metric].usage` with a real filtered `total` (no breakdown).
 *  - filter + breakdown (different dims) → the breakdown computed within the
 *    filtered slice, plus a filtered `total` so the headline matches the series.
 *
 * The caller keeps using `useApiGetBillingUsage` for the unfiltered page-load totals.
 */
export function useApiGetBillingUsageDetail<M extends UsageMetric>(
    env: string,
    timeframe: { start: string; end: string } | undefined,
    metric: M,
    spec: {
        dimension?: BreakdownDimensions[M] | null;
        filter?: { dimension: BreakdownDimensions[M]; value: string } | null;
    },
    top: number,
    options?: { enabled?: boolean; avgPerDay?: boolean }
) {
    const dimension = spec.dimension ?? null;
    const filter = spec.filter ?? null;
    const avgPerDay = options?.avgPerDay ?? false;

    // Fetch lazily: only once the panel has something to detail — a breakdown or a filter — and
    // the caller hasn't disabled it.
    const hasDetail = Boolean(dimension) || Boolean(filter);
    const enabled = Boolean(env) && Boolean(timeframe) && hasDetail && (options?.enabled ?? true);

    return useQuery<GetBillingUsage['Success'], APIError>({
        enabled,
        // `filter` is part of the key so drilling into a different value refetches rather than
        // serving the previous slice.
        queryKey: [...GetBillingUsageQueryKey, 'detail', timeframe, metric, dimension, filter, top, avgPerDay],
        queryFn: async (): Promise<GetBillingUsage['Success']> => {
            const params = new URLSearchParams({ env });
            if (timeframe) {
                params.append('from', timeframe.start);
                params.append('to', timeframe.end);
            }
            params.append('metrics', metric);
            if (dimension) {
                params.append(`breakdown[${metric}]`, dimension);
            }
            if (filter) {
                params.append(`filter[${metric}]`, `${filter.dimension}:${filter.value}`);
            }
            if (avgPerDay) {
                params.append('avgPerDay', 'true');
            }
            params.append('top', String(top));

            const res = await apiFetch(`/api/v1/plans/billing-usage?${params.toString()}`, {
                method: 'GET'
            });

            const json = (await res.json()) as GetBillingUsage['Reply'];
            if (res.status !== 200 || 'error' in json) {
                throw new APIError({ res, json });
            }

            return json;
        }
    });
}

export const GetBillingUsageTopDimensionValuesQueryKey = ['plans', 'billing-usage', 'top-dimension-values'];

// Top values for a (metric, dimension, month) are stable, so keep them fresh for a while —
// reopening (or prefetching) the filter popover serves the cache instead of refetching.
const TOP_DIMENSION_VALUES_STALE_TIME = 5 * 60 * 1000;

// `search` is part of the key so each search term caches independently; `page`
// is the infinite-query page param, not the key.
function topDimensionValuesQueryKey(timeframe: { start: string; end: string } | undefined, metric: UsageMetric, dimension: string | null, search: string) {
    return [...GetBillingUsageTopDimensionValuesQueryKey, timeframe, metric, dimension, search];
}

function fetchTopDimensionValuesPage(
    env: string,
    metric: UsageMetric,
    dimension: string | null,
    timeframe: { start: string; end: string } | undefined,
    search: string
) {
    return async ({ pageParam = 0 }: { pageParam?: number }): Promise<GetBillingUsageTopDimensionValues['Success']> => {
        const params = new URLSearchParams({ env, metric, page: String(pageParam) });
        if (timeframe) {
            params.append('from', timeframe.start);
            params.append('to', timeframe.end);
        }
        if (dimension) {
            params.append('dimension', dimension);
        }
        if (search) {
            params.append('search', search);
        }

        const res = await apiFetch(`/api/v1/plans/billing-usage/top-dimension-values?${params.toString()}`, { method: 'GET' });

        const json = (await res.json()) as GetBillingUsageTopDimensionValues['Reply'];
        if (res.status !== 200 || 'error' in json) {
            throw new APIError({ res, json });
        }

        return json;
    };
}

/**
 * Seen values for a (metric, dimension) over a timeframe, ranked by usage and
 * paged so ANY value is reachable — `search` narrows to matching values across
 * the customer's full set (server-side), and pages load incrementally past the
 * first. Backs the filter value picker. Lazy — only fires when `enabled` and a
 * dimension is set.
 */
export function useApiGetBillingUsageTopDimensionValues<M extends UsageMetric>(
    env: string,
    metric: M,
    dimension: BreakdownDimensions[M] | null,
    timeframe: { start: string; end: string } | undefined,
    search: string,
    options?: { enabled?: boolean }
) {
    return useInfiniteQuery<
        GetBillingUsageTopDimensionValues['Success'],
        APIError,
        InfiniteData<GetBillingUsageTopDimensionValues['Success']>,
        QueryKey,
        number
    >({
        enabled: Boolean(env) && Boolean(timeframe) && Boolean(dimension) && (options?.enabled ?? true),
        staleTime: TOP_DIMENSION_VALUES_STALE_TIME,
        queryKey: topDimensionValuesQueryKey(timeframe, metric, dimension, search),
        queryFn: fetchTopDimensionValuesPage(env, metric, dimension, timeframe, search),
        initialPageParam: 0,
        getNextPageParam: (lastPage) => (lastPage.data.pagination.hasMore ? lastPage.data.pagination.page + 1 : undefined),
        // Keep showing the previous pages while a new search term's first page loads, so the
        // input doesn't unmount mid-keystroke and lose focus (see useGetIntegrationFunctions).
        placeholderData: keepPreviousData
    });
}

/**
 * Returns a callback that warms the value cache (first page, no search) for a set of dimensions.
 * Call it when the filter popover opens so picking a dimension shows its values instantly instead
 * of spinning through a fetch. No-ops per dimension while the cached values are still fresh.
 */
export function useApiPrefetchBillingUsageTopDimensionValues(env: string, metric: UsageMetric, timeframe: { start: string; end: string } | undefined) {
    const queryClient = useQueryClient();
    return useCallback(
        (dimensions: readonly string[]) => {
            if (!env || !timeframe) return;
            for (const dimension of dimensions) {
                void queryClient.prefetchInfiniteQuery({
                    staleTime: TOP_DIMENSION_VALUES_STALE_TIME,
                    queryKey: topDimensionValuesQueryKey(timeframe, metric, dimension, ''),
                    queryFn: fetchTopDimensionValuesPage(env, metric, dimension, timeframe, ''),
                    initialPageParam: 0
                });
            }
        },
        [queryClient, env, metric, timeframe]
    );
}

export function useTrial(plan?: ApiPlan | null): { isTrial: boolean; isTrialOver: boolean; daysRemaining: number } {
    const res = useMemo<{ isTrial: boolean; isTrialOver: boolean; daysRemaining: number }>(() => {
        if (!plan || !plan.auto_idle || !plan.trial_end_at) {
            return { isTrial: false, isTrialOver: false, daysRemaining: 0 };
        }
        const days = Math.floor((new Date(plan.trial_end_at).getTime() - new Date().getTime()) / (86400 * 1000));
        return { isTrial: true, isTrialOver: plan.trial_expired || false, daysRemaining: days };
    }, [plan]);

    return res;
}

export function usePutBillingInvoicingDetails(env: string) {
    const queryClient = useQueryClient();
    return useMutation<PutBillingInvoicingDetails['Success'], APIError, PutBillingInvoicingDetails['Body']>({
        mutationFn: async (body): Promise<PutBillingInvoicingDetails['Success']> => {
            const res = await apiFetch(`/api/v1/plans/billing/invoicing?env=${env}`, {
                method: 'PUT',
                body: JSON.stringify(body)
            });
            const json = (await res.json()) as PutBillingInvoicingDetails['Reply'];
            if (res.status !== 200 || 'error' in json) throw new APIError({ res, json });
            return json;
        },
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: GetBillingUsageQueryKey });
        }
    });
}

export function useApiPostPlanChange(env: string) {
    return useMutation<PostPlanChange['Success'], APIError, PostPlanChange['Body']>({
        mutationFn: async (body): Promise<PostPlanChange['Success']> => {
            const res = await apiFetch(`/api/v1/plans/change?env=${env}`, {
                method: 'POST',
                body: JSON.stringify(body)
            });

            const json = (await res.json()) as PostPlanChange['Reply'];
            if (res.status !== 200 || 'error' in json) {
                throw new APIError({ res, json });
            }

            return json;
        }
    });
}
