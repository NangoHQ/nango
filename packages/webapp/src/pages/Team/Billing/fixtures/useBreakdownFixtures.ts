// INTERNAL — dev/testing only. Backs the `usageBreakdownFixtures` dev flag.
import { parseAsString, useQueryState } from 'nuqs';
import { useMemo } from 'react';

import {
    FIXTURE_ACCOUNT_PARAM,
    buildFixtureBreakdownEntries,
    getCapturedBaseMetric,
    getCapturedFixtureEntries,
    useFixtureData,
    useFixtureDimensionValues
} from './usageBreakdownFixtures';
import { DEFAULT_TOP_N } from '../usageBreakdown';
import { useFeatureFlagsStore } from '@/store/feature-flags';

import type { AnyBreakdownDimension } from '../usageBreakdown';
import type { ApiBillingUsageMetric, BillingUsageMetric, UsageMetric } from '@nangohq/types';

interface UseBreakdownFixturesArgs {
    /** Whether the breakdown view is active at all (the `usageBreakdown` gate). */
    enabled: boolean;
    metric: UsageMetric;
    dimension: AnyBreakdownDimension | null;
    env: string;
    timeframe: { start: string; end: string };
    selectedMonth: Date;
    /** The real base metric — used to pick the synthesized series' view mode. */
    data?: ApiBillingUsageMetric;
}

interface BreakdownFixtures {
    /** The `usageBreakdownFixtures` flag is on; callers skip the live query when so. */
    flagOn: boolean;
    /** Mock base metric for the selected fixture account, overriding the real one. */
    baseMetric?: ApiBillingUsageMetric;
    /** Fixture breakdown entries (captured, else synthesized) for the current dimension. */
    entries?: BillingUsageMetric[];
    /** Header total for the invented fixture data. */
    total?: number;
    /** Loading state of the synthesized-values fetch. */
    loading: boolean;
}

/**
 * When the `usageBreakdownFixtures` flag is on, drives a usage panel from captured
 * prod data instead of the live API: preferring real captured breakdowns for the
 * selected month/account, and falling back to a synthesized distribution over the
 * env's real dimension values for months we didn't capture.
 */
export function useBreakdownFixtures({ enabled, metric, dimension, env, timeframe, selectedMonth, data }: UseBreakdownFixturesArgs): BreakdownFixtures {
    const flagOn = useFeatureFlagsStore((s) => s.usageBreakdownFixtures);
    const active = enabled && flagOn;
    const fixtureData = useFixtureData(active);
    const [account] = useQueryState(FIXTURE_ACCOUNT_PARAM, parseAsString.withDefault('').withOptions({ history: 'replace' }));

    const baseMetric = useMemo(
        () => (active && fixtureData ? getCapturedBaseMetric(account, selectedMonth, metric) : undefined),
        [active, fixtureData, account, selectedMonth, metric]
    );

    const inBreakdownMode = active && dimension !== null;
    const captured = useMemo(
        () => (inBreakdownMode && dimension && fixtureData ? getCapturedFixtureEntries(account, selectedMonth, metric, dimension) : undefined),
        [inBreakdownMode, dimension, account, selectedMonth, metric, fixtureData]
    );

    // Months we didn't capture get a synthesized distribution over real dimension values.
    const needSynth = inBreakdownMode && dimension !== null && !captured;
    const { values, isLoading } = useFixtureDimensionValues(env, dimension, needSynth);
    const viewMode = (baseMetric ?? data)?.view_mode === 'cumulative' ? 'cumulative' : 'periodic';
    const synthesized = useMemo<BillingUsageMetric[] | undefined>(
        () => (needSynth && dimension ? buildFixtureBreakdownEntries({ metric, dimension, values, timeframe, top: DEFAULT_TOP_N, viewMode }) : undefined),
        [needSynth, dimension, metric, values, timeframe, viewMode]
    );

    const entries = captured ?? synthesized;
    const total = entries ? entries.reduce((sum, e) => sum + e.total, 0) : undefined;

    return { flagOn, baseMetric, entries, total, loading: isLoading };
}
