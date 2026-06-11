import { useMeta } from '@/hooks/useMeta';
import { useFeatureFlagsStore } from '@/store/feature-flags';

/**
 * Whether the usage breakdown view is shown. Two independent opt-ins:
 *
 * 1. The account's server-side billing-usage source — `billingUsageSource ===
 *    'clickhouse'` from /api/v1/meta, set by the rollout allowlist. This is the
 *    real signal and takes precedence: once it's on, the dev flag is a no-op.
 * 2. The local-storage `usageBreakdown` dev flag, for previewing the feature on
 *    accounts the rollout hasn't reached yet.
 */
export function useBreakdownEnabled(): boolean {
    const { data: meta } = useMeta();
    const devFlag = useFeatureFlagsStore((s) => s.usageBreakdown);
    return meta?.data.billingUsageSource === 'clickhouse' || devFlag;
}
