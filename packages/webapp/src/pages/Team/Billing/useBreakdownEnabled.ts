import { useMeta } from '@/hooks/useMeta';

/**
 * Whether the usage breakdown view is shown, driven by the account's
 * server-side billing-usage source — `billingUsageSource === 'clickhouse'` from
 * /api/v1/meta, set by the rollout allowlist.
 */
export function useBreakdownEnabled(): boolean {
    const { data: meta } = useMeta();
    return meta?.data.billingUsageSource === 'clickhouse';
}
