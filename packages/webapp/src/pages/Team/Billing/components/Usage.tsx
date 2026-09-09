import { ExternalLink, Info } from 'lucide-react';
import { parseAsBoolean, useQueryState } from 'nuqs';
import { useMemo } from 'react';

import { Alert, AlertActions, AlertDescription, AlertTitle, Button } from '@nangohq/design-system';

import { CriticalErrorAlert } from '@/components/patterns/CriticalErrorAlert';
import { Switch } from '@/components/ui/Switch';
import { useApiGetBillingPeriodCosts, useApiGetBillingUsage, useApiGetProjectedCosts, useCurrentPlan } from '@/hooks/usePlan';
import { useStore } from '@/store';
import { track } from '@/utils/analytics';
import { billedUsageMetrics, LEGACY_USAGE_METRICS, S26_USAGE_METRICS } from '@/utils/usage';
import { hasMonthlySpend, isLegacyPlan } from '../planVisibility';
import { buildProjectedCharges, buildUsageRowCharges } from '../usageCharges';
import { usePlanTransition } from '../usePlanTransition';
import { useSelectedMonth } from '../useSelectedMonth';
import { FreeUsage } from './FreeUsage';
import { MonthSelector } from './MonthSelector';
import { USAGE_METRIC_LABELS } from './usageMetrics';
import { UsageTable } from './UsageTable';

import type { UsageTableRow } from './UsageTable';
import type { UsageMetric } from '@nangohq/types';

const showLegacyParam = parseAsBoolean.withDefault(false).withOptions({ history: 'replace' });

export const Usage: React.FC = () => {
    const env = useStore((state) => state.env);
    const { selectedMonth, isCurrentMonth } = useSelectedMonth();
    const { data: environmentData } = useCurrentPlan(env);
    const plan = environmentData?.plan;
    const isFree = plan?.name === 'free';
    const [showLegacy, setShowLegacy] = useQueryState('legacyMetrics', showLegacyParam);
    const transition = usePlanTransition();
    const isMigrating = transition !== null;
    const metrics = billedUsageMetrics(plan, isMigrating);

    // Calculate timeframe for the selected month
    const timeframe = useMemo(() => monthTimeframe(selectedMonth, 0), [selectedMonth]);

    // Free renders <FreeUsage/> (which fetches its own ClickHouse data), so skip this query for
    // Free — it would double-fetch. Gate on `plan` being resolved too: until it loads `isFree` is
    // false, so a bare `!isFree` would fire one request (and can briefly hit Orb) before we know
    // the plan. Paid accounts have `plan` cached from the app shell, so this adds no real delay.
    // avgPerDay: connections/records come back as the concurrent daily count rather than the
    // billing running-average, matching what each row's drill-in chart also requests.
    const { data: usage, isLoading, error: usageError } = useApiGetBillingUsage(env, timeframe, { avgPerDay: true, enabled: plan != null && !isFree });

    const orbChargesEnabled = hasMonthlySpend(plan);
    const {
        data: periodCosts,
        isPending: costsPending,
        isError: costsError
    } = useApiGetBillingPeriodCosts(env, plan, { enabled: orbChargesEnabled, ...(isCurrentMonth ? {} : { timeframe }) });
    const chargeArgs = { enabled: orbChargesEnabled, isPending: costsPending, isError: costsError, data: periodCosts };
    const orbCharges = buildUsageRowCharges(chargeArgs);
    const orbCurrentPlanCharges = buildUsageRowCharges({ ...chargeArgs, unpriced: 'dash' });

    const { data: projected, isPending: projectedPending, isError: projectedError } = useApiGetProjectedCosts(env, timeframe, { enabled: isMigrating });
    const projectedCharges = buildProjectedCharges({ enabled: isMigrating, isPending: projectedPending, isError: projectedError, data: projected });

    if (usageError) {
        return (
            <div className="w-full flex flex-col gap-6">
                <CriticalErrorAlert message="Error loading usage" />
            </div>
        );
    }

    // Free accounts get the caps view (usage against plan limits, with the same drill-in). Capped
    // metrics live only on the Free plan; paid/legacy keep the current charts-only view below.
    if (isFree) {
        return (
            <div className="w-full flex flex-col gap-4">
                <FreeUsage metrics={metrics} />
            </div>
        );
    }

    const isLegacy = isLegacyPlan(plan);
    // Paid/legacy plans are uncapped (only `freePlan` sets real limits in `plans/definitions.ts`).
    const rowFor = (metric: UsageMetric, extra: Partial<UsageTableRow> = {}): UsageTableRow => ({
        metric,
        label: USAGE_METRIC_LABELS[metric],
        usage: usage?.data.usage[metric]?.total ?? 0,
        limit: null,
        capsLoading: isLoading,
        data: usage?.data.usage[metric],
        ...extra
    });

    const charges = isMigrating ? projectedCharges : orbCharges;

    const legacyOnlyMetrics = LEGACY_USAGE_METRICS.filter((metric) => !S26_USAGE_METRICS.includes(metric));
    const rows: UsageTableRow[] = isMigrating
        ? metrics.map((metric) =>
              rowFor(metric, {
                  charge: projectedCharges?.(metric),
                  ...(orbCurrentPlanCharges ? { currentPlanCharge: orbCurrentPlanCharges(metric) } : {})
              })
          )
        : metrics.map((metric) => rowFor(metric));

    // No `charge`: Pay-as-you-go does not price these meters, so that column states nothing.
    const legacyRows: UsageTableRow[] = legacyOnlyMetrics.map((metric) => rowFor(metric, orbCharges ? { currentPlanCharge: orbCharges(metric) } : {}));
    return (
        <div className="w-full flex flex-col gap-4">
            {/* A migrating account already has the transition banner. */}
            {isLegacy && !isMigrating && (
                <Alert variant="info">
                    <Info />
                    <AlertTitle>Legacy plan</AlertTitle>
                    <AlertDescription>
                        Legacy plans have different usage metrics.
                        {usage?.data.customer.portalUrl && ' You can see your usage in your billing portal.'}
                    </AlertDescription>
                    {usage?.data.customer.portalUrl && (
                        <AlertActions>
                            <Button asChild variant="link-accent" size="xs">
                                <a
                                    href={usage.data.customer.portalUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={() => track('web:usage:billing_portal_clicked', {})}
                                >
                                    View billing portal
                                    <ExternalLink />
                                </a>
                            </Button>
                        </AlertActions>
                    )}
                </Alert>
            )}

            <div className="flex justify-between items-center">
                <span className="text-text-strong text-body-medium-medium">Usage</span>
                <MonthSelector />
            </div>

            <UsageTable
                rows={rows}
                isLoading={isLoading}
                env={env}
                timeframe={timeframe}
                chartMode="daily"
                variant={isMigrating ? 'comparison' : charges ? 'charges' : 'usage'}
                charges={charges}
                currentPlanTitle={transition?.fromTitle}
                currentPlanTooltip={transition ? `Plan active until ${transition.at}.` : undefined}
                projectedTooltip={isMigrating ? 'Estimated amount based on new rates.' : undefined}
            />

            {isMigrating && (
                <div className="flex items-center gap-2 px-1">
                    <Switch
                        id="legacy-metrics"
                        checked={showLegacy}
                        onCheckedChange={(checked) => {
                            void setShowLegacy(checked);
                            track('web:usage:legacy_metrics_toggled', { shown: checked });
                        }}
                    />
                    <label htmlFor="legacy-metrics" className="cursor-pointer text-text-secondary text-body-small-regular">
                        Show legacy billing metrics
                    </label>
                </div>
            )}

            {isMigrating && showLegacy && (
                <UsageTable
                    rows={legacyRows}
                    isLoading={isLoading}
                    env={env}
                    timeframe={timeframe}
                    chartMode="daily"
                    variant="comparison"
                    currentPlanTitle={transition?.fromTitle}
                    legacy
                />
            )}
        </div>
    );
};

function monthTimeframe(month: Date, offset: number): { start: string; end: string } {
    const start = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + offset, 1));
    const end = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + offset + 1, 1));
    return { start: start.toISOString(), end: end.toISOString() };
}
